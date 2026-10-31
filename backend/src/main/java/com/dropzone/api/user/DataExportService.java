package com.dropzone.api.user;

import com.dropzone.api.common.Dtos.MeasurementDto;
import com.dropzone.api.common.Dtos.PhotoCredit;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.domain.Block;
import com.dropzone.api.domain.BlockRepository;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.CommentLikeRepository;
import com.dropzone.api.domain.CommentRepository;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FriendRequest;
import com.dropzone.api.domain.FriendRequestRepository;
import com.dropzone.api.domain.Friendship;
import com.dropzone.api.domain.FriendshipRepository;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.HypeRepository;
import com.dropzone.api.domain.MeasurementRepository;
import com.dropzone.api.domain.Notification;
import com.dropzone.api.domain.NotificationRepository;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.PushTokenRepository;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.ReportRepository;
import com.dropzone.api.domain.SlipUp;
import com.dropzone.api.domain.SlipUpRepository;
import com.dropzone.api.domain.SlipUpType;
import com.dropzone.api.domain.SlipUpTypeRepository;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.domain.WeighInRepository;
import com.dropzone.api.user.DataExport.CommentEntry;
import com.dropzone.api.user.DataExport.CommentLikeEntry;
import com.dropzone.api.user.DataExport.CompletionEntry;
import com.dropzone.api.user.DataExport.DayEntry;
import com.dropzone.api.user.DataExport.DeviceEntry;
import com.dropzone.api.user.DataExport.Friends;
import com.dropzone.api.user.DataExport.GoalEntry;
import com.dropzone.api.user.DataExport.HypeEntry;
import com.dropzone.api.user.DataExport.MilestoneEntry;
import com.dropzone.api.user.DataExport.NotificationEntry;
import com.dropzone.api.user.DataExport.Person;
import com.dropzone.api.user.DataExport.PostEntry;
import com.dropzone.api.user.DataExport.Profile;
import com.dropzone.api.user.DataExport.ProofEntry;
import com.dropzone.api.user.DataExport.QuestEntry;
import com.dropzone.api.user.DataExport.ReportEntry;
import com.dropzone.api.user.DataExport.SlipUpEntry;
import com.dropzone.api.user.DataExport.SlipUpTypeEntry;
import com.dropzone.api.user.DataExport.TransformationEntry;
import com.dropzone.api.user.DataExport.WeighInEntry;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
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
public class DataExportService {

	private final UserService users;
	private final UserRepository userRepository;
	private final GoalRepository goals;
	private final CheckpointRepository checkpoints;
	private final ProofRepository proofs;
	private final UserQuestRepository quests;
	private final QuestCompletionRepository completions;
	private final DailyResultRepository dailyResults;
	private final WeighInRepository weighIns;
	private final MeasurementRepository measurements;
	private final SlipUpRepository slipUps;
	private final SlipUpTypeRepository slipUpTypes;
	private final FeedItemRepository feed;
	private final CommentRepository comments;
	private final TransformationRepository transformations;
	private final FriendshipRepository friendships;
	private final FriendRequestRepository requests;
	private final BlockRepository blocks;
	private final NotificationRepository notifications;
	private final HypeRepository hypes;
	private final CommentLikeRepository commentLikes;
	private final ReportRepository reports;
	private final PushTokenRepository pushTokens;
	private final Clock clock;

	public DataExportService(UserService users, UserRepository userRepository, GoalRepository goals, CheckpointRepository checkpoints,
			ProofRepository proofs, UserQuestRepository quests, QuestCompletionRepository completions, DailyResultRepository dailyResults,
			WeighInRepository weighIns, MeasurementRepository measurements, SlipUpRepository slipUps, SlipUpTypeRepository slipUpTypes,
			FeedItemRepository feed, CommentRepository comments, TransformationRepository transformations, FriendshipRepository friendships,
			FriendRequestRepository requests, BlockRepository blocks, NotificationRepository notifications, HypeRepository hypes,
			CommentLikeRepository commentLikes, ReportRepository reports, PushTokenRepository pushTokens, Clock clock) {
		this.users = users;
		this.userRepository = userRepository;
		this.goals = goals;
		this.checkpoints = checkpoints;
		this.proofs = proofs;
		this.quests = quests;
		this.completions = completions;
		this.dailyResults = dailyResults;
		this.weighIns = weighIns;
		this.measurements = measurements;
		this.slipUps = slipUps;
		this.slipUpTypes = slipUpTypes;
		this.feed = feed;
		this.comments = comments;
		this.transformations = transformations;
		this.friendships = friendships;
		this.requests = requests;
		this.blocks = blocks;
		this.notifications = notifications;
		this.hypes = hypes;
		this.commentLikes = commentLikes;
		this.reports = reports;
		this.pushTokens = pushTokens;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public DataExport export(UUID userId) {
		User user = users.get(userId);
		Map<UUID, Proof> proofById = proofs.findByUserId(userId).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		List<Goal> ownGoals = goals.findByUserIdOrderByCreatedAtAsc(userId);
		Map<UUID, List<Checkpoint>> milestones = ownGoals.isEmpty() ? Map.of()
				: checkpoints.findByGoalIdInOrderByIndexAsc(ownGoals.stream().map(g -> g.id).toList()).stream()
						.collect(Collectors.groupingBy(c -> c.goalId));
		List<GoalEntry> goalEntries = ownGoals.stream().map(g -> new GoalEntry(g.id, g.path, g.metric, g.metricLabel, g.unit, g.startValue,
				g.goalValue, g.currentValue, g.active, g.createdAt, g.endedAt, milestones.getOrDefault(g.id, List.of()).stream()
						.map(c -> new MilestoneEntry(c.id, c.index, c.targetValue, c.rewardTitle, c.rewardImageUrl,
								c.rewardImageCreditName == null ? null : new PhotoCredit(c.rewardImageCreditName, c.rewardImageCreditLink),
								c.visibility, c.verification, c.deadline, c.status, c.clearedAt, proof(proofById.get(c.proofId))))
						.toList()))
				.toList();
		List<SlipUp> ownSlipUps = slipUps.findByUserIdOrderByOccurredAtAsc(userId);
		Set<String> slipUpCodes = ownSlipUps.stream().map(s -> s.type).collect(Collectors.toSet());
		Map<String, SlipUpType> slipUpType = slipUpCodes.isEmpty() ? Map.of()
				: slipUpTypes.findAllById(slipUpCodes).stream().collect(Collectors.toMap(t -> t.code, Function.identity()));

		List<Friendship> friends = friendships.findByUserId(userId);
		List<FriendRequest> incoming = requests.findByToUserIdOrderByCreatedAtDesc(userId);
		List<FriendRequest> outgoing = requests.findByFromUserIdOrderByCreatedAtDesc(userId);
		List<Block> blocked = blocks.findByBlockerIdOrderByCreatedAtDesc(userId);
		List<Notification> ownNotifications = notifications.findByUserIdOrderByCreatedAtAsc(userId);
		Set<UUID> people = new HashSet<>();
		friends.forEach(f -> people.add(f.friendId));
		incoming.forEach(r -> people.add(r.fromUserId));
		outgoing.forEach(r -> people.add(r.toUserId));
		blocked.forEach(b -> people.add(b.blockedId));
		ownNotifications.stream().map(n -> n.actorId).filter(Objects::nonNull).forEach(people::add);
		Map<UUID, UserSummary> summaries = summaries(people);

		return new DataExport(clock.instant(), profile(user),
				goalEntries,
				quests.findByUserIdOrderByCreatedAtAsc(userId).stream().map(q -> new QuestEntry(q.id, q.code, q.name, q.icon, q.group, q.proof,
						q.autoSource, q.target, q.custom, List.copyOf(q.days), q.perDay, q.squadCheck, q.checkAudience, q.active, q.createdAt)).toList(),
				completions.findByUserIdOrderByDayAscCreatedAtAsc(userId).stream().map(c -> new CompletionEntry(c.id, c.userQuestId, c.day,
						c.slot, c.status, c.value, c.reps, c.summary, c.createdAt, proof(c.proofId == null ? null : proofById.get(c.proofId))))
						.toList(),
				dailyResults.findByUserIdOrderByDayAsc(userId).stream().map(d -> new DayEntry(d.day, d.doneCount, d.totalCount)).toList(),
				weighIns.findByUserIdOrderByDayAsc(userId).stream().map(w -> new WeighInEntry(w.day, w.value, w.photoUrl, w.mlText,
						w.createdAt)).toList(),
				measurements.findByUserIdOrderByDayAscCreatedAtAsc(userId).stream()
						.map(m -> new MeasurementDto(m.id, m.metric, m.day, m.value, m.createdAt)).toList(),
				ownSlipUps.stream().map(s -> new SlipUpEntry(s.id, s.type, slipUpType.containsKey(s.type) ? slipUpType.get(s.type).name : s.type,
						s.occurredAt, s.note, s.createdAt)).toList(),
				slipUpTypes.findByUserIdOrderBySortAsc(userId).stream().map(t -> new SlipUpTypeEntry(t.code, t.name, t.icon, t.active)).toList(),
				feed.findByUserIdOrderByCreatedAtAsc(userId).stream().map(f -> new PostEntry(f.id, f.type, f.title, f.subtitle, f.photoUrl,
						f.deltaValue, f.value, f.unit, f.isPublic, f.hidden, f.createdAt, f.proofId, f.checkpointId, f.transformationId)).toList(),
				comments.findByUserIdOrderByCreatedAtAsc(userId).stream().map(c -> new CommentEntry(c.id, c.feedItemId, c.body, c.hidden,
						c.createdAt)).toList(),
				transformations.findByUserIdOrderByCreatedAtDesc(userId).stream().map(t -> new TransformationEntry(t.id, t.beforeUrl,
						t.afterUrl, t.beforeCaption, t.afterCaption, t.layout, t.visibility, t.removedByModerator, t.createdAt, t.updatedAt))
						.toList(),
				new Friends(friends.stream().map(f -> new Person(summaries.get(f.friendId), f.createdAt)).toList(),
						incoming.stream().map(r -> new Person(summaries.get(r.fromUserId), r.createdAt)).toList(),
						outgoing.stream().map(r -> new Person(summaries.get(r.toUserId), r.createdAt)).toList(),
						blocked.stream().map(b -> new Person(summaries.get(b.blockedId), b.createdAt)).toList()),
				ownNotifications.stream().map(n -> new NotificationEntry(n.id, n.type, n.actorId == null ? null : summaries.get(n.actorId),
						n.feedItemId, n.proofId, n.commentId, n.text, n.readAt != null, n.createdAt)).toList(),
				hypes.findByUserIdOrderByCreatedAtAsc(userId).stream().map(h -> new HypeEntry(h.feedItemId, h.createdAt)).toList(),
				commentLikes.findByUserIdOrderByCreatedAtAsc(userId).stream().map(l -> new CommentLikeEntry(l.commentId, l.createdAt)).toList(),
				reports.findByReporterIdOrderByCreatedAtAsc(userId).stream().map(r -> new ReportEntry(r.targetType, r.targetId, r.reason,
						r.createdAt)).toList(),
				pushTokens.findByUserId(userId).stream().map(t -> new DeviceEntry(t.platform, t.updatedAt)).toList());
	}

	private Profile profile(User user) {
		Instant now = clock.instant();
		return new Profile(user.id, user.email, user.displayName, user.handle, user.bio, user.avatarUrl, user.theme, user.path, user.timezone,
				user.weightUnit, user.lengthUnit, user.unlockMode, user.minutesPerQuest, user.publicByDefault, user.defaultVerification,
				user.slipUpTracking, user.skipRestDays, List.copyOf(user.lockedApps), user.streak, user.bestStreak, user.inviteCode,
				user.createdAt, user.lastSeenAt, user.isProActive(now), user.proExpiresAt, user.proProductId, user.trialEndsAt,
				user.termsVersion, user.privacyVersion, user.termsAcceptedAt, user.ageConfirmedAt, user.hiddenFromSearch,
				user.hiddenFromLeaderboards, user.verifyRequestPushes, user.commentPushes, user.shareStats, user.shareStatsAt,
				user.regionSource, user.regionValue, user.regionEu, user.regionAt);
	}

	private static ProofEntry proof(Proof proof) {
		return proof == null ? null : new ProofEntry(proof.id, proof.kind, proof.photoUrl, proof.value, List.copyOf(proof.mlLabels),
				proof.mlText, proof.status, proof.requiredVerifications, proof.verifiedCount, proof.isPublic, proof.aiChecked, proof.createdAt);
	}

	private Map<UUID, UserSummary> summaries(Collection<UUID> ids) {
		return ids.isEmpty() ? Map.of()
				: userRepository.findByIdIn(ids).stream().collect(Collectors.toMap(u -> u.id, UserService::summary));
	}
}
