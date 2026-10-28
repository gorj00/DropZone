package com.dropzone.api.moderation;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.domain.Block;
import com.dropzone.api.domain.BlockRepository;
import com.dropzone.api.domain.FriendRequestRepository;
import com.dropzone.api.domain.Friendship;
import com.dropzone.api.domain.FriendshipRepository;
import com.dropzone.api.domain.NotificationRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BlockService {

	private final BlockRepository blocks;
	private final FriendshipRepository friendships;
	private final FriendRequestRepository requests;
	private final NotificationRepository notifications;
	private final UserRepository users;
	private final Clock clock;

	public BlockService(BlockRepository blocks, FriendshipRepository friendships, FriendRequestRepository requests,
			NotificationRepository notifications, UserRepository users, Clock clock) {
		this.blocks = blocks;
		this.friendships = friendships;
		this.requests = requests;
		this.notifications = notifications;
		this.users = users;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public Set<UUID> hiddenUsers(UUID userId) {
		Set<UUID> result = new HashSet<>();
		for (Block block : blocks.findByBlockerIdOrBlockedId(userId, userId)) {
			result.add(block.blockerId.equals(userId) ? block.blockedId : block.blockerId);
		}
		result.addAll(users.findSuspendedIds());
		result.remove(userId);
		return result;
	}

	@Transactional(readOnly = true)
	public boolean blockedEitherWay(UUID a, UUID b) {
		return blocks.existsById(new Block.Key(a, b)) || blocks.existsById(new Block.Key(b, a));
	}

	@Transactional
	public void block(UUID userId, UUID targetId) {
		if (userId.equals(targetId)) {
			throw ApiException.validation("You can't block yourself");
		}
		users.findById(targetId).orElseThrow(() -> ApiException.notFound("User not found"));
		if (!blocks.existsById(new Block.Key(userId, targetId))) {
			Block block = new Block(userId, targetId);
			block.createdAt = clock.instant();
			blocks.save(block);
		}
		friendships.deleteById(new Friendship.Key(userId, targetId));
		friendships.deleteById(new Friendship.Key(targetId, userId));
		requests.findByFromUserIdAndToUserId(userId, targetId).ifPresent(requests::delete);
		requests.findByFromUserIdAndToUserId(targetId, userId).ifPresent(requests::delete);
		notifications.deleteByTypeAndActorIdAndUserId(NotificationType.FRIEND_REQUEST, userId, targetId);
		notifications.deleteByTypeAndActorIdAndUserId(NotificationType.FRIEND_REQUEST, targetId, userId);
	}

	@Transactional
	public void unblock(UUID userId, UUID targetId) {
		blocks.deleteById(new Block.Key(userId, targetId));
	}

	@Transactional(readOnly = true)
	public List<UserSummary> blocked(UUID userId) {
		List<UUID> ids = blocks.findByBlockerIdOrderByCreatedAtDesc(userId).stream().map(b -> b.blockedId).toList();
		Map<UUID, User> byId = users.findByIdIn(ids).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		return ids.stream().map(byId::get).filter(Objects::nonNull).map(UserService::summary).toList();
	}
}
