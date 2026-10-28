package com.dropzone.api.feed;

import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.ModerationState;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.Transformation;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.user.UserService;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class FeedAccess {

	private final SocialService social;
	private final BlockService blocks;
	private final TransformationRepository transformations;
	private final CheckpointRepository checkpoints;
	private final FeedItemRepository feed;
	private final UserRepository userRepository;
	private final UserService users;

	public FeedAccess(SocialService social, BlockService blocks, TransformationRepository transformations, CheckpointRepository checkpoints,
			FeedItemRepository feed, UserRepository userRepository, UserService users) {
		this.social = social;
		this.blocks = blocks;
		this.transformations = transformations;
		this.checkpoints = checkpoints;
		this.feed = feed;
		this.userRepository = userRepository;
		this.users = users;
	}

	public record Viewer(User me, Set<UUID> friendIds, Set<UUID> hiddenUsers) {
	}

	@Transactional(readOnly = true)
	public Viewer viewer(User me) {
		return new Viewer(me, social.friendIds(me.id), blocks.hiddenUsers(me.id));
	}

	@Transactional(readOnly = true)
	public Map<UUID, Transformation> transformationsOf(List<FeedItem> items) {
		List<UUID> ids = items.stream().map(i -> i.transformationId).filter(Objects::nonNull).distinct().toList();
		return ids.isEmpty() ? Map.of()
				: transformations.findAllById(ids).stream().collect(Collectors.toMap(t -> t.id, Function.identity()));
	}

	@Transactional(readOnly = true)
	public List<FeedItem> filter(Viewer viewer, List<FeedItem> items) {
		if (items.isEmpty()) {
			return List.of();
		}
		Map<UUID, Transformation> byId = transformationsOf(items);
		UUID me = viewer.me().id;
		Set<UUID> authorIds = items.stream().map(i -> i.userId).filter(id -> !id.equals(me)).collect(Collectors.toSet());
		Map<UUID, User> authors = authorIds.isEmpty() ? Map.of()
				: userRepository.findByIdIn(authorIds).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		List<UUID> milestoneIds = items.stream().filter(i -> !i.userId.equals(me)).map(i -> i.checkpointId).filter(Objects::nonNull)
				.distinct().toList();
		Set<UUID> privateMilestones = milestoneIds.isEmpty() ? Set.of()
				: checkpoints.findAllById(milestoneIds).stream().filter(c -> c.visibility == PostVisibility.PRIVATE).map(c -> c.id)
						.collect(Collectors.toSet());
		return items.stream().filter(i -> canSee(viewer, i, byId, authors, privateMilestones)).toList();
	}

	@Transactional(readOnly = true)
	public boolean canSee(Viewer viewer, FeedItem item) {
		return !filter(viewer, List.of(item)).isEmpty();
	}

	public static ModerationState moderation(FeedItem item, Proof proof) {
		return ModerationState.of(proof != null && proof.removedByModerator, item.hidden);
	}

	public static ModerationState moderation(Transformation transformation, FeedItem item) {
		return ModerationState.of(transformation.removedByModerator, item != null && item.hidden);
	}

	@Transactional(readOnly = true)
	public ModerationState moderation(Proof proof) {
		return ModerationState.of(proof.removedByModerator, feed.existsByProofIdAndHiddenTrue(proof.id));
	}

	private boolean canSee(Viewer viewer, FeedItem item, Map<UUID, Transformation> byId, Map<UUID, User> authors,
			Set<UUID> privateMilestones) {
		UUID me = viewer.me().id;
		boolean mine = item.userId.equals(me);
		if (viewer.hiddenUsers().contains(item.userId) || (item.hidden && !mine)) {
			return false;
		}
		if (!mine) {
			User author = authors.get(item.userId);
			if (author == null || !users.isPro(author) || (item.checkpointId != null && privateMilestones.contains(item.checkpointId))) {
				return false;
			}
		}
		if (item.type == FeedType.TRANSFORMATION) {
			Transformation transformation = byId.get(item.transformationId);
			if (transformation == null || transformation.visibility == PostVisibility.PRIVATE) {
				return false;
			}
		}
		return item.isPublic || mine || viewer.friendIds().contains(item.userId);
	}
}
