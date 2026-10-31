package com.dropzone.api.feed;

import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.NotificationRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class CommentPushes {

	public static final Duration EVERY = Duration.ofHours(1);
	private static final UUID NOBODY = new UUID(0, 0);
	private static final List<NotificationType> TYPES = List.of(NotificationType.COMMENT, NotificationType.COMMENT_REPLY);

	private final UserRepository users;
	private final NotificationRepository notifications;
	private final BlockService blocks;
	private final PushService push;
	private final Clock clock;

	public CommentPushes(UserRepository users, NotificationRepository notifications, BlockService blocks, PushService push, Clock clock) {
		this.users = users;
		this.notifications = notifications;
		this.blocks = blocks;
		this.push = push;
		this.clock = clock;
	}

	public void send(UUID targetId, User actor, FeedItem item, UUID commentId, PushType type, String text) {
		User target = users.findById(targetId).orElse(null);
		if (target == null || !target.commentPushes) {
			return;
		}
		Instant now = clock.instant();
		boolean loud = users.claimCommentPush(target.id, item.id, now, now.minus(EVERY)) > 0;
		Set<UUID> hidden = new HashSet<>(blocks.hiddenUsers(target.id));
		hidden.add(NOBODY);
		long others = notifications.countUnreadCommenters(target.id, item.id, TYPES, hidden) - 1;
		String action = type == PushType.COMMENT || (others > 0 && item.userId.equals(target.id)) ? "commented on your post"
				: "replied to your comment";
		String who = others <= 0 ? actor.displayName : actor.displayName + " and " + others + (others == 1 ? " other" : " others");
		Map<String, String> data = new HashMap<>(Map.of("feedItemId", item.id.toString(), "commentId", commentId.toString(),
				PushService.TAG, "comments-" + item.id));
		if (!loud) {
			data.put(PushService.QUIET, "1");
		}
		push.notify(target, type, who + " " + action, text, data);
	}
}
