package com.dropzone.api.notification;

import com.dropzone.api.common.Cursor;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.NotificationDto;
import com.dropzone.api.common.Paged;
import com.dropzone.api.common.Tally;
import com.dropzone.api.domain.Notification;
import com.dropzone.api.domain.NotificationRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class NotificationService {

	private static final int MAX_LIMIT = 50;
	private static final int MAX_TEXT = 200;
	private static final UUID NOBODY = new UUID(0, 0);
	private static final int PURGE_BATCH = 5000;

	private final NotificationRepository notifications;
	private final UserRepository users;
	private final BlockService blocks;
	private final Clock clock;
	private final TransactionTemplate tx;

	public NotificationService(NotificationRepository notifications, UserRepository users, BlockService blocks, Clock clock,
			TransactionTemplate tx) {
		this.notifications = notifications;
		this.users = users;
		this.blocks = blocks;
		this.clock = clock;
		this.tx = tx;
	}

	public Tally purgeOlderThan(Duration age) {
		Instant cutoff = clock.instant().minus(age);
		int deleted = 0;
		Integer batch;
		do {
			batch = tx.execute(status -> notifications.deleteOlderThan(cutoff, PURGE_BATCH));
			deleted += batch == null ? 0 : batch;
		}
		while (batch != null && batch == PURGE_BATCH);
		return new Tally().add("deleted", deleted);
	}

	@Transactional
	public void notify(UUID userId, NotificationType type, UUID actorId, UUID feedItemId, UUID proofId, UUID commentId, String text) {
		if (actorId != null && actorId.equals(userId)) {
			return;
		}
		Notification notification = new Notification();
		notification.id = UUID.randomUUID();
		notification.userId = userId;
		notification.type = type;
		notification.actorId = actorId;
		notification.feedItemId = feedItemId;
		notification.proofId = proofId;
		notification.commentId = commentId;
		notification.text = text == null || text.length() <= MAX_TEXT ? text : text.substring(0, MAX_TEXT - 1) + "…";
		notification.createdAt = clock.instant();
		notifications.save(notification);
	}

	@Transactional
	public boolean notifyOnce(UUID userId, NotificationType type, UUID actorId, UUID feedItemId, UUID proofId, String text) {
		Optional<Notification> existing = notifications.findFirstByTypeAndActorIdAndFeedItemId(type, actorId, feedItemId);
		if (existing.isPresent()) {
			existing.get().retracted = false;
			return false;
		}
		notify(userId, type, actorId, feedItemId, proofId, null, text);
		return true;
	}

	@Transactional
	public void retract(NotificationType type, UUID actorId, UUID commentId) {
		notifications.deleteByTypeAndActorIdAndCommentId(type, actorId, commentId);
	}

	@Transactional
	public void retractFor(NotificationType type, UUID actorId, UUID userId) {
		notifications.deleteByTypeAndActorIdAndUserId(type, actorId, userId);
	}

	@Transactional
	public void hide(NotificationType type, UUID actorId, UUID feedItemId) {
		notifications.retract(type, actorId, feedItemId);
	}

	@Transactional(readOnly = true)
	public Paged<NotificationDto> list(UUID userId, Instant before, String cursor, Integer limit) {
		int size = limit == null ? 30 : Math.max(1, Math.min(MAX_LIMIT, limit));
		Cursor from = Cursor.start(cursor, before, clock.instant());
		List<Notification> page = notifications.page(userId, hidden(userId), from.at(), from.id(), size);
		Set<UUID> actorIds = page.stream().map(n -> n.actorId).filter(Objects::nonNull).collect(Collectors.toSet());
		Map<UUID, User> actors = users.findByIdIn(actorIds).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		List<NotificationDto> items = page.stream()
				.map(n -> new NotificationDto(n.id, n.type, actors.containsKey(n.actorId) ? UserService.summary(actors.get(n.actorId)) : null,
						n.feedItemId, n.proofId, n.commentId, n.text, n.readAt != null, n.createdAt))
				.toList();
		Notification last = page.isEmpty() ? null : page.getLast();
		return new Paged<>(items, page.size() < size || last == null ? null : Cursor.after(last.createdAt, last.id).toString());
	}

	@Transactional(readOnly = true)
	public CountDto unread(UUID userId) {
		return new CountDto(notifications.countUnread(userId, hidden(userId)));
	}

	private Set<UUID> hidden(UUID userId) {
		Set<UUID> hidden = new HashSet<>(blocks.hiddenUsers(userId));
		hidden.add(NOBODY);
		return hidden;
	}

	@Transactional
	public void markRead(UUID userId, List<UUID> ids) {
		Instant now = clock.instant();
		if (ids == null || ids.isEmpty()) {
			notifications.markAllRead(userId, now);
			return;
		}
		for (Notification notification : notifications.findAllById(ids)) {
			if (notification.userId.equals(userId) && notification.readAt == null) {
				notification.readAt = now;
			}
		}
	}
}
