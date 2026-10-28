package com.dropzone.api.goal;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.CheckpointSocialDto;
import com.dropzone.api.common.Dtos.PeopleDto;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.Hype;
import com.dropzone.api.domain.HypeRepository;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.user.UserService;
import java.util.Comparator;
import java.util.LinkedHashSet;
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
public class CheckpointSocialService {

	private static final int MAX_FACES = 5;
	private static final Set<CheckpointStatus> CHASING = Set.of(CheckpointStatus.ACTIVE, CheckpointStatus.PENDING_VERIFICATION);
	private static final Set<PostVisibility> SHARED = Set.of(PostVisibility.FRIENDS, PostVisibility.EVERYONE);

	private final CheckpointRepository checkpoints;
	private final GoalRepository goals;
	private final FeedItemRepository feed;
	private final HypeRepository hypes;
	private final UserRepository userRepository;
	private final UserService users;
	private final SocialService social;
	private final BlockService blocks;

	public CheckpointSocialService(CheckpointRepository checkpoints, GoalRepository goals, FeedItemRepository feed, HypeRepository hypes,
			UserRepository userRepository, UserService users, SocialService social, BlockService blocks) {
		this.checkpoints = checkpoints;
		this.goals = goals;
		this.feed = feed;
		this.hypes = hypes;
		this.userRepository = userRepository;
		this.users = users;
		this.social = social;
		this.blocks = blocks;
	}

	@Transactional(readOnly = true)
	public CheckpointSocialDto get(UUID userId, UUID checkpointId) {
		User me = users.get(userId);
		users.requirePro(me, "Community activity");
		Checkpoint cp = checkpoints.findById(checkpointId).orElseThrow(() -> ApiException.notFound("Milestone not found"));
		Goal goal = goals.findById(cp.goalId).filter(g -> g.userId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Milestone not found"));
		Set<UUID> hidden = blocks.hiddenUsers(userId);
		List<UUID> itemIds = feed.findByCheckpointId(cp.id).stream().map(i -> i.id).toList();
		List<UUID> hypers = itemIds.isEmpty() ? List.of()
				: hypes.findByFeedItemIdIn(itemIds).stream()
						.sorted(Comparator.comparing((Hype h) -> h.createdAt).reversed())
						.map(h -> h.userId)
						.filter(id -> !id.equals(userId) && !hidden.contains(id))
						.collect(Collectors.toCollection(LinkedHashSet::new))
						.stream().toList();
		List<UUID> chasing = alsoChasing(userId, goal.path, cp.index).stream().filter(id -> !hidden.contains(id)).toList();
		return new CheckpointSocialDto(people(hypers), people(chasing));
	}

	private List<UUID> alsoChasing(UUID userId, Path path, int index) {
		Set<UUID> friendIds = social.friendIds(userId);
		if (friendIds.isEmpty()) {
			return List.of();
		}
		Map<UUID, UUID> ownerByGoal = goals.findByUserIdInAndActiveTrue(friendIds).stream()
				.filter(g -> g.path == path)
				.collect(Collectors.toMap(g -> g.id, g -> g.userId));
		if (ownerByGoal.isEmpty()) {
			return List.of();
		}
		List<UUID> owners = checkpoints.findByGoalIdInAndIndexAndVisibilityIn(ownerByGoal.keySet(), index, SHARED).stream()
				.filter(c -> CHASING.contains(c.status))
				.map(c -> ownerByGoal.get(c.goalId))
				.distinct()
				.toList();
		if (owners.isEmpty()) {
			return owners;
		}
		Set<UUID> pro = userRepository.findByIdIn(owners).stream().filter(users::isPro).map(u -> u.id).collect(Collectors.toSet());
		return owners.stream().filter(pro::contains).toList();
	}

	private PeopleDto people(List<UUID> ids) {
		if (ids.isEmpty()) {
			return new PeopleDto(0, List.of());
		}
		List<UUID> shown = ids.subList(0, Math.min(MAX_FACES, ids.size()));
		Map<UUID, User> byId = userRepository.findByIdIn(shown).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		return new PeopleDto(ids.size(), shown.stream().map(byId::get).filter(Objects::nonNull).map(UserService::summary).toList());
	}
}
