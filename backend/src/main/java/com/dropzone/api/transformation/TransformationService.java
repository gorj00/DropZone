package com.dropzone.api.transformation;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.TransformationDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.CommentRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.HypeRepository;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.Transformation;
import com.dropzone.api.domain.TransformationLayout;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.feed.FeedAccess;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.moderation.ImageCheck;
import com.dropzone.api.moderation.Reported;
import com.dropzone.api.storage.PhotoUrls;
import com.dropzone.api.storage.UploadCleanup;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TransformationService {

	private static final String TITLE = "Before & after";
	private static final UUID NOBODY = new UUID(0, 0);

	private final TransformationRepository transformations;
	private final FeedItemRepository feed;
	private final CommentRepository comments;
	private final HypeRepository hypes;
	private final UserService users;
	private final BlockService blocks;
	private final PhotoUrls photoUrls;
	private final UploadCleanup uploads;
	private final ImageCheck imageCheck;
	private final Clock clock;

	public TransformationService(TransformationRepository transformations, FeedItemRepository feed, CommentRepository comments,
			HypeRepository hypes, UserService users, BlockService blocks, PhotoUrls photoUrls, UploadCleanup uploads, ImageCheck imageCheck,
			Clock clock) {
		this.transformations = transformations;
		this.feed = feed;
		this.comments = comments;
		this.hypes = hypes;
		this.users = users;
		this.blocks = blocks;
		this.photoUrls = photoUrls;
		this.uploads = uploads;
		this.imageCheck = imageCheck;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<TransformationDto> list(UUID userId) {
		List<Transformation> list = transformations.findByUserIdOrderByCreatedAtDesc(userId);
		Map<UUID, FeedItem> items = list.isEmpty() ? Map.of()
				: feed.findByTransformationIdIn(list.stream().map(t -> t.id).toList()).stream()
						.collect(Collectors.toMap(i -> i.transformationId, Function.identity(), (a, b) -> a));
		List<UUID> itemIds = items.values().stream().map(i -> i.id).toList();
		Set<UUID> hidden = hidden(userId);
		Map<UUID, Integer> commentCounts = new HashMap<>();
		if (!itemIds.isEmpty()) {
			for (Object[] row : comments.countVisibleByFeedItemIds(itemIds, hidden)) {
				commentCounts.put((UUID) row[0], ((Number) row[1]).intValue());
			}
		}
		Map<UUID, Long> hypeCounts = itemIds.isEmpty() ? Map.of()
				: hypes.findByFeedItemIdIn(itemIds).stream().filter(h -> !hidden.contains(h.userId))
						.collect(Collectors.groupingBy(h -> h.feedItemId, Collectors.counting()));
		return list.stream().map(t -> {
			FeedItem item = items.get(t.id);
			return item == null ? toDto(t, null, 0, 0)
					: toDto(t, item, commentCounts.getOrDefault(item.id, 0), hypeCounts.getOrDefault(item.id, 0L).intValue());
		}).toList();
	}

	@Transactional
	public TransformationDto create(UUID userId, Requests.CreateTransformation req) {
		User me = users.get(userId);
		Transformation t = new Transformation();
		t.id = UUID.randomUUID();
		t.userId = userId;
		t.beforeUrl = photoUrls.ownUpload(userId, req.beforeUrl(), "beforeUrl");
		t.afterUrl = photoUrls.ownUpload(userId, req.afterUrl(), "afterUrl");
		t.beforeCaption = clean(req.beforeCaption());
		t.afterCaption = clean(req.afterCaption());
		t.layout = req.layout() == null ? TransformationLayout.SPLIT : req.layout();
		t.visibility = req.visibility() == null ? PostVisibility.PRIVATE : req.visibility();
		if (t.visibility != PostVisibility.PRIVATE) {
			users.requirePro(me, "Sharing transformations");
		}
		t.createdAt = clock.instant();
		t.updatedAt = t.createdAt;
		transformations.save(t);
		FeedItem item = sync(t, false, false);
		return toDto(t, item, 0, 0);
	}

	@Transactional
	public TransformationDto update(UUID userId, UUID id, Requests.UpdateTransformation req) {
		User me = users.get(userId);
		Transformation t = own(userId, id);
		List<String> replaced = new ArrayList<>();
		boolean edited = false;
		if (req.beforeUrl() != null && !photoUrls.canonical(req.beforeUrl()).equals(t.beforeUrl)) {
			replaced.add(t.beforeUrl);
			t.beforeUrl = photoUrls.ownUpload(userId, req.beforeUrl(), "beforeUrl");
			edited = true;
		}
		if (req.afterUrl() != null && !photoUrls.canonical(req.afterUrl()).equals(t.afterUrl)) {
			replaced.add(t.afterUrl);
			t.afterUrl = photoUrls.ownUpload(userId, req.afterUrl(), "afterUrl");
			edited = true;
		}
		if (req.beforeCaption() != null && !Objects.equals(clean(req.beforeCaption()), t.beforeCaption)) {
			t.beforeCaption = clean(req.beforeCaption());
			edited = true;
		}
		if (req.afterCaption() != null && !Objects.equals(clean(req.afterCaption()), t.afterCaption)) {
			t.afterCaption = clean(req.afterCaption());
			edited = true;
		}
		if (req.layout() != null) {
			t.layout = req.layout();
		}
		if (req.visibility() != null && req.visibility() != t.visibility) {
			if (req.visibility() != PostVisibility.PRIVATE) {
				if (t.removedByModerator) {
					throw ApiException.conflict(Reported.REMOVED);
				}
				if (req.visibility().compareTo(t.visibility) > 0) {
					Reported.requireShareable(FeedAccess.moderation(t, feed.findByTransformationId(t.id).orElse(null)));
				}
				users.requirePro(me, "Sharing transformations");
			}
			t.visibility = req.visibility();
		}
		t.updatedAt = clock.instant();
		FeedItem item = sync(t, edited, !replaced.isEmpty());
		replaced.forEach(uploads::deleteIfUnused);
		return toDto(t, item, item == null ? 0 : commentCount(userId, item.id), item == null ? 0 : hypeCount(userId, item.id));
	}

	@Transactional
	public void delete(UUID userId, UUID id) {
		Transformation t = own(userId, id);
		feed.findByTransformationId(t.id).ifPresent(feed::delete);
		transformations.delete(t);
		uploads.deleteIfUnused(t.beforeUrl);
		uploads.deleteIfUnused(t.afterUrl);
	}

	private FeedItem sync(Transformation t, boolean edited, boolean photosChanged) {
		Optional<FeedItem> existing = feed.findByTransformationId(t.id);
		existing.filter(item -> edited).ifPresent(item -> item.reviewed = false);
		if (t.visibility == PostVisibility.PRIVATE) {
			existing.ifPresent(item -> {
				item.isPublic = false;
				item.photoUrl = t.afterUrl;
			});
			return existing.orElse(null);
		}
		boolean wasPublic = existing.map(item -> item.isPublic).orElse(false);
		FeedItem item = existing.orElseGet(() -> {
			FeedItem created = new FeedItem();
			created.id = UUID.randomUUID();
			created.userId = t.userId;
			created.type = FeedType.TRANSFORMATION;
			created.transformationId = t.id;
			created.title = TITLE;
			created.createdAt = clock.instant();
			return created;
		});
		item.photoUrl = t.afterUrl;
		item.subtitle = t.afterCaption != null ? t.afterCaption : t.beforeCaption;
		item.isPublic = t.visibility == PostVisibility.EVERYONE;
		FeedItem saved = feed.save(item);
		if (saved.isPublic && (!wasPublic || photosChanged)) {
			imageCheck.screen(saved);
		}
		return saved;
	}

	private Set<UUID> hidden(UUID userId) {
		Set<UUID> hidden = new HashSet<>(blocks.hiddenUsers(userId));
		hidden.add(NOBODY);
		return hidden;
	}

	private int commentCount(UUID userId, UUID itemId) {
		return comments.countVisibleByFeedItemIds(List.of(itemId), hidden(userId)).stream().mapToInt(row -> ((Number) row[1]).intValue())
				.sum();
	}

	private int hypeCount(UUID userId, UUID itemId) {
		Set<UUID> hidden = hidden(userId);
		return (int) hypes.findByFeedItemIdIn(List.of(itemId)).stream().filter(h -> !hidden.contains(h.userId)).count();
	}

	private Transformation own(UUID userId, UUID id) {
		return transformations.findById(id).filter(t -> t.userId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Transformation not found"));
	}

	private static String clean(String caption) {
		if (caption == null) {
			return null;
		}
		String trimmed = caption.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	private static TransformationDto toDto(Transformation t, FeedItem item, int commentCount, int hypeCount) {
		return new TransformationDto(t.id, t.beforeUrl, t.afterUrl, t.beforeCaption, t.afterCaption, t.layout, t.visibility, t.createdAt,
				t.updatedAt, item == null ? null : item.id, commentCount, hypeCount, t.removedByModerator, FeedAccess.moderation(t, item));
	}
}
