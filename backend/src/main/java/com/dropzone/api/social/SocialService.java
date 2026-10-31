package com.dropzone.api.social;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.FriendRequestDto;
import com.dropzone.api.common.Dtos.InviteDto;
import com.dropzone.api.common.Dtos.InviteResultDto;
import com.dropzone.api.common.Dtos.Relation;
import com.dropzone.api.common.Dtos.RequestsDto;
import com.dropzone.api.common.Dtos.UserProfileDto;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.config.AppProperties;
import com.dropzone.api.domain.FriendRequest;
import com.dropzone.api.domain.FriendRequestRepository;
import com.dropzone.api.domain.Friendship;
import com.dropzone.api.domain.FriendshipRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocialService {

	public static final int MIN_SEARCH = 3;
	public static final int MAX_SEARCH_RESULTS = 10;

	private final FriendshipRepository friendships;
	private final FriendRequestRepository requests;
	private final UserRepository users;
	private final UserService userService;
	private final PushService push;
	private final NotificationService notifications;
	private final BlockService blocks;
	private final AppProperties props;
	private final Clock clock;

	public SocialService(FriendshipRepository friendships, FriendRequestRepository requests, UserRepository users,
			UserService userService, PushService push, NotificationService notifications, BlockService blocks, AppProperties props,
			Clock clock) {
		this.friendships = friendships;
		this.requests = requests;
		this.users = users;
		this.userService = userService;
		this.push = push;
		this.notifications = notifications;
		this.blocks = blocks;
		this.props = props;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public Set<UUID> friendIds(UUID userId) {
		return friendships.findByUserId(userId).stream().map(f -> f.friendId).collect(Collectors.toCollection(LinkedHashSet::new));
	}

	@Transactional(readOnly = true)
	public int friendCount(UUID userId) {
		Set<UUID> ids = friendIds(userId);
		ids.removeAll(blocks.hiddenUsers(userId));
		return ids.size();
	}

	@Transactional(readOnly = true)
	public boolean areFriends(UUID a, UUID b) {
		return friendships.existsByUserIdAndFriendId(a, b);
	}

	@Transactional(readOnly = true)
	public Relation relation(UUID me, UUID other) {
		if (me.equals(other)) {
			return Relation.SELF;
		}
		if (areFriends(me, other)) {
			return Relation.FRIEND;
		}
		if (requests.findByFromUserIdAndToUserId(me, other).isPresent()) {
			return Relation.REQUESTED;
		}
		if (requests.findByFromUserIdAndToUserId(other, me).isPresent()) {
			return Relation.INCOMING;
		}
		return Relation.NONE;
	}

	@Transactional(readOnly = true)
	public UserProfileDto profile(UUID userId, UUID otherId) {
		User other = visibleUser(userService.get(userId), otherId);
		Relation relation = relation(userId, other.id);
		UUID requestId = switch (relation) {
			case REQUESTED -> requests.findByFromUserIdAndToUserId(userId, other.id).map(r -> r.id).orElse(null);
			case INCOMING -> requests.findByFromUserIdAndToUserId(other.id, userId).map(r -> r.id).orElse(null);
			default -> null;
		};
		return new UserProfileDto(UserService.summary(other), relation, requestId);
	}

	@Transactional(readOnly = true)
	public User visibleUser(User me, UUID otherId) {
		if (me.id.equals(otherId)) {
			return me;
		}
		userService.requirePro(me, "Feed");
		return users.findById(otherId).filter(u -> !u.isSuspended() && !blocks.blockedEitherWay(me.id, u.id))
				.orElseThrow(() -> ApiException.notFound("User not found"));
	}

	@Transactional(readOnly = true)
	public List<UserSummary> friends(UUID userId) {
		userService.requirePro(userService.get(userId), "Friends");
		Set<UUID> hidden = blocks.hiddenUsers(userId);
		return users.findByIdIn(friendIds(userId)).stream()
				.filter(u -> !hidden.contains(u.id))
				.sorted(Comparator.comparing(u -> u.displayName.toLowerCase()))
				.map(UserService::summary)
				.toList();
	}

	@Transactional(readOnly = true)
	public List<UserSummary> search(UUID userId, String q) {
		userService.requirePro(userService.get(userId), "Friends");
		String name = q == null ? "" : q.trim().toLowerCase();
		String handle = name.startsWith("@") ? name.substring(1) : name;
		if (handle.length() < MIN_SEARCH) {
			return List.of();
		}
		String prefix = handle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
		Set<UUID> hidden = blocks.hiddenUsers(userId);
		return users.search(userId, handle, prefix, name, PageRequest.of(0, MAX_SEARCH_RESULTS)).stream()
				.filter(u -> !hidden.contains(u.id)).map(UserService::summary).toList();
	}

	@Transactional(readOnly = true)
	public RequestsDto requests(UUID userId) {
		userService.get(userId);
		Set<UUID> hidden = blocks.hiddenUsers(userId);
		List<FriendRequest> incoming = requests.findByToUserIdOrderByCreatedAtDesc(userId).stream().filter(r -> !hidden.contains(r.fromUserId))
				.toList();
		List<FriendRequest> outgoing = requests.findByFromUserIdOrderByCreatedAtDesc(userId).stream().filter(r -> !hidden.contains(r.toUserId))
				.toList();
		Set<UUID> ids = new HashSet<>();
		incoming.forEach(r -> {
			ids.add(r.fromUserId);
			ids.add(r.toUserId);
		});
		outgoing.forEach(r -> {
			ids.add(r.fromUserId);
			ids.add(r.toUserId);
		});
		Map<UUID, User> byId = users.findByIdIn(ids).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		return new RequestsDto(incoming.stream().map(r -> toDto(r, byId)).toList(), outgoing.stream().map(r -> toDto(r, byId)).toList());
	}

	@Transactional
	public FriendRequestDto sendRequest(UUID userId, UUID targetId) {
		User me = userService.get(userId);
		userService.requirePro(me, "Friends");
		if (userId.equals(targetId)) {
			throw ApiException.validation("You can't add yourself");
		}
		User target = users.findById(targetId).filter(u -> !u.isSuspended() && !blocks.blockedEitherWay(userId, u.id))
				.orElseThrow(() -> ApiException.notFound("User not found"));
		if (areFriends(userId, targetId)) {
			throw ApiException.conflict("Already friends");
		}
		if (requests.findByFromUserIdAndToUserId(userId, targetId).isPresent()) {
			throw ApiException.conflict("Request already sent");
		}
		if (requests.findByFromUserIdAndToUserId(targetId, userId).isPresent()) {
			throw ApiException.conflict("They already sent you a request");
		}
		return toDto(createRequest(me, target), Map.of(me.id, me, target.id, target));
	}

	private FriendRequest createRequest(User me, User target) {
		FriendRequest request = new FriendRequest();
		request.id = UUID.randomUUID();
		request.fromUserId = me.id;
		request.toUserId = target.id;
		request.createdAt = clock.instant();
		requests.save(request);
		notifications.notify(target.id, NotificationType.FRIEND_REQUEST, me.id, null, null, null, null);
		push.notify(target, PushType.FRIEND_REQUEST, "New friend request", me.displayName + " wants to drop together",
				Map.of("requestId", request.id.toString(), "userId", me.id.toString()));
		return request;
	}

	@Transactional
	public UserSummary accept(UUID userId, UUID requestId) {
		User me = userService.get(userId);
		userService.requirePro(me, "Friends");
		FriendRequest request = requests.findById(requestId).filter(r -> r.toUserId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Request not found"));
		User from = users.findById(request.fromUserId).orElseThrow(() -> ApiException.notFound("User not found"));
		requests.delete(request);
		befriend(userId, from.id);
		notifications.notify(from.id, NotificationType.FRIEND_ACCEPTED, userId, null, null, null, null);
		push.notify(from, PushType.FRIEND_ACCEPTED, "Friend request accepted", me.displayName + " accepted your request",
				Map.of("userId", me.id.toString()));
		return UserService.summary(from);
	}

	@Transactional
	public void deleteRequest(UUID userId, UUID requestId) {
		FriendRequest request = requests.findById(requestId)
				.filter(r -> r.toUserId.equals(userId) || r.fromUserId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Request not found"));
		requests.delete(request);
		notifications.retractFor(NotificationType.FRIEND_REQUEST, request.fromUserId, request.toUserId);
	}

	@Transactional
	public void removeFriend(UUID userId, UUID friendId) {
		friendships.deleteById(new Friendship.Key(userId, friendId));
		friendships.deleteById(new Friendship.Key(friendId, userId));
	}

	@Transactional(readOnly = true)
	public InviteDto invite(UUID userId) {
		User me = userService.get(userId);
		userService.requirePro(me, "Invites");
		return new InviteDto(me.inviteCode, props.inviteBaseUrl() + me.inviteCode);
	}

	@Transactional
	public InviteResultDto acceptInvite(UUID userId, String code) {
		User me = userService.get(userId);
		userService.requirePro(me, "Invites");
		User owner = users.findByInviteCode(code.trim().toUpperCase()).filter(u -> !u.isSuspended() && !blocks.blockedEitherWay(userId, u.id))
				.orElseThrow(() -> ApiException.notFound("Invite not found"));
		if (owner.id.equals(userId)) {
			throw ApiException.validation("That's your own invite");
		}
		if (areFriends(userId, owner.id)) {
			return new InviteResultDto(UserService.summary(owner), Relation.FRIEND);
		}
		Optional<FriendRequest> theirs = requests.findByFromUserIdAndToUserId(owner.id, userId);
		if (theirs.isPresent()) {
			requests.delete(theirs.get());
			notifications.retractFor(NotificationType.FRIEND_REQUEST, owner.id, userId);
			befriend(userId, owner.id);
			notifications.notify(owner.id, NotificationType.FRIEND_ACCEPTED, userId, null, null, null, null);
			push.notify(owner, PushType.FRIEND_ACCEPTED, "Friend request accepted", me.displayName + " accepted your request",
					Map.of("userId", me.id.toString()));
			return new InviteResultDto(UserService.summary(owner), Relation.FRIEND);
		}
		if (requests.findByFromUserIdAndToUserId(userId, owner.id).isEmpty()) {
			createRequest(me, owner);
		}
		return new InviteResultDto(UserService.summary(owner), Relation.REQUESTED);
	}

	@Transactional(readOnly = true)
	public List<User> verifiers(UUID ownerId) {
		Set<UUID> hidden = blocks.hiddenUsers(ownerId);
		Set<UUID> ids = friendIds(ownerId);
		ids.removeAll(hidden);
		return ids.isEmpty() ? List.of() : users.findByIdIn(ids).stream().filter(userService::isPro).toList();
	}

	void befriend(UUID a, UUID b) {
		if (!friendships.existsByUserIdAndFriendId(a, b)) {
			friendships.save(new Friendship(a, b));
		}
		if (!friendships.existsByUserIdAndFriendId(b, a)) {
			friendships.save(new Friendship(b, a));
		}
	}

	private FriendRequestDto toDto(FriendRequest request, Map<UUID, User> byId) {
		return new FriendRequestDto(request.id, UserService.summary(byId.get(request.fromUserId)),
				UserService.summary(byId.get(request.toUserId)), request.createdAt);
	}
}
