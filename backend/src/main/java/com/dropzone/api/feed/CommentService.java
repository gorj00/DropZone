package com.dropzone.api.feed;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.CommentDto;
import com.dropzone.api.domain.Comment;
import com.dropzone.api.domain.CommentLike;
import com.dropzone.api.domain.CommentLikeRepository;
import com.dropzone.api.domain.CommentRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.ReportRepository;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.feed.FeedAccess.Viewer;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommentService {

	static final int MAX_PUSH_TEXT = 120;

	private final CommentRepository comments;
	private final CommentLikeRepository likes;
	private final FeedItemRepository feed;
	private final ReportRepository reports;
	private final UserRepository userRepository;
	private final UserService users;
	private final FeedAccess access;
	private final NotificationService notifications;
	private final PushService push;
	private final BlockService blocks;
	private final Clock clock;

	public CommentService(CommentRepository comments, CommentLikeRepository likes, FeedItemRepository feed, ReportRepository reports,
			UserRepository userRepository, UserService users, FeedAccess access, NotificationService notifications, PushService push,
			BlockService blocks, Clock clock) {
		this.comments = comments;
		this.likes = likes;
		this.feed = feed;
		this.reports = reports;
		this.userRepository = userRepository;
		this.users = users;
		this.access = access;
		this.notifications = notifications;
		this.push = push;
		this.blocks = blocks;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<CommentDto> list(UUID userId, UUID feedItemId) {
		User me = users.get(userId);
		FeedItem item = visibleItem(me, feedItemId);
		if (!item.userId.equals(userId)) {
			users.requirePro(me, "Comments");
		}
		Set<UUID> hiddenUsers = access.viewer(me).hiddenUsers();
		List<Comment> list = comments.findByFeedItemIdOrderByCreatedAtAsc(feedItemId).stream()
				.filter(c -> !hiddenUsers.contains(c.userId) && (!c.hidden || c.userId.equals(userId)))
				.toList();
		Map<UUID, User> authors = userRepository.findByIdIn(list.stream().map(c -> c.userId).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(u -> u.id, Function.identity()));
		List<UUID> ids = list.stream().map(c -> c.id).toList();
		Map<UUID, Integer> counts = new HashMap<>();
		Set<UUID> liked = Set.of();
		if (!ids.isEmpty()) {
			for (Object[] row : likes.countByCommentIds(ids)) {
				counts.put((UUID) row[0], ((Number) row[1]).intValue());
			}
			liked = likes.findByUserIdAndCommentIdIn(userId, ids).stream().map(l -> l.commentId).collect(Collectors.toSet());
		}
		Set<UUID> likedByMe = liked;
		return list.stream().filter(c -> authors.containsKey(c.userId))
				.map(c -> toDto(c, authors.get(c.userId), item, userId, counts.getOrDefault(c.id, 0), likedByMe.contains(c.id)))
				.toList();
	}

	@Transactional
	public CommentDto like(UUID userId, UUID commentId) {
		User me = users.get(userId);
		users.requirePro(me, "Likes");
		Comment comment = comments.findById(commentId).orElseThrow(() -> ApiException.notFound("Comment not found"));
		FeedItem item = visibleItem(me, comment.feedItemId);
		boolean mine = comment.userId.equals(userId);
		if ((comment.hidden && !mine) || access.viewer(me).hiddenUsers().contains(comment.userId)) {
			throw ApiException.notFound("Comment not found");
		}
		User author = userRepository.findById(comment.userId).orElseThrow(() -> ApiException.notFound("Comment not found"));
		CommentLike.Key key = new CommentLike.Key(commentId, userId);
		boolean liked;
		if (likes.existsById(key)) {
			likes.deleteById(key);
			notifications.retract(NotificationType.COMMENT_LIKE, userId, commentId);
			liked = false;
		} else {
			CommentLike like = new CommentLike();
			like.commentId = commentId;
			like.userId = userId;
			like.createdAt = clock.instant();
			likes.save(like);
			notifications.notify(comment.userId, NotificationType.COMMENT_LIKE, userId, item.id, item.proofId, comment.id, comment.body);
			liked = true;
		}
		likes.flush();
		return toDto(comment, author, item, userId, (int) likes.countByCommentId(commentId), liked);
	}

	@Transactional
	public CommentDto add(UUID userId, UUID feedItemId, String body) {
		User me = users.get(userId);
		users.requirePro(me, "Comments");
		FeedItem item = visibleItem(me, feedItemId);
		String text = body == null ? "" : body.trim();
		if (text.isEmpty()) {
			throw ApiException.validation("Write something first");
		}
		Comment comment = new Comment();
		comment.id = UUID.randomUUID();
		comment.feedItemId = item.id;
		comment.userId = userId;
		comment.body = text;
		comment.createdAt = clock.instant();
		comments.save(comment);
		notifications.notify(item.userId, NotificationType.COMMENT, userId, item.id, item.proofId, comment.id, text);
		if (!item.userId.equals(userId) && !blocks.blockedEitherWay(userId, item.userId)) {
			push.notify(userRepository.findById(item.userId).orElse(null), PushType.COMMENT, me.displayName + " commented on your post",
					preview(text), Map.of("feedItemId", item.id.toString(), "commentId", comment.id.toString()));
		}
		return toDto(comment, me, item, userId, 0, false);
	}

	@Transactional
	public void delete(UUID userId, UUID commentId) {
		Comment comment = comments.findById(commentId).orElseThrow(() -> ApiException.notFound("Comment not found"));
		if (!comment.userId.equals(userId)) {
			FeedItem item = visibleItem(users.get(userId), comment.feedItemId);
			if (!item.userId.equals(userId)) {
				throw ApiException.forbidden("You can only delete your own comments or comments on your posts");
			}
		}
		reports.deleteByTargetTypeAndTargetId(ReportTarget.COMMENT, commentId);
		comments.delete(comment);
	}

	private FeedItem visibleItem(User me, UUID feedItemId) {
		FeedItem item = feed.findById(feedItemId).orElseThrow(() -> ApiException.notFound("Post not found"));
		Viewer viewer = access.viewer(me);
		if (!access.canSee(viewer, item)) {
			throw ApiException.notFound("Post not found");
		}
		return item;
	}

	private static String preview(String text) {
		return text.length() <= MAX_PUSH_TEXT ? text : text.substring(0, MAX_PUSH_TEXT - 1) + "…";
	}

	private static CommentDto toDto(Comment comment, User author, FeedItem item, UUID me, int likeCount, boolean likedByMe) {
		boolean mine = comment.userId.equals(me);
		return new CommentDto(comment.id, comment.feedItemId, UserService.summary(author), comment.body, comment.createdAt, mine, likeCount,
				likedByMe, mine || item.userId.equals(me));
	}
}
