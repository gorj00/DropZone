package com.dropzone.api.feed;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Cursor;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.FeedItemDto;
import com.dropzone.api.common.Dtos.HiddenReason;
import com.dropzone.api.common.Dtos.ProofViewDto;
import com.dropzone.api.common.Dtos.Relation;
import com.dropzone.api.common.Dtos.TransformationView;
import com.dropzone.api.common.Dtos.VerificationInfo;
import com.dropzone.api.common.Paged;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.CommentRepository;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FeedScope;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.Hype;
import com.dropzone.api.domain.HypeRepository;
import com.dropzone.api.domain.ModerationState;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofKind;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.ProofStatus;
import com.dropzone.api.domain.ProofVerification;
import com.dropzone.api.domain.ProofVerificationRepository;
import com.dropzone.api.domain.QuestCompletion;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.ReportRepository;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.Transformation;
import com.dropzone.api.domain.TransformationRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.feed.FeedAccess.Viewer;
import com.dropzone.api.goal.GoalService;
import com.dropzone.api.moderation.ImageCheck;
import com.dropzone.api.moderation.Reported;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.rules.CheckpointPlanner;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.today.TodayService;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
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
public class FeedService {

	public static final Duration AI_FALLBACK_AFTER = Duration.ofHours(48);
	private static final int MAX_LIMIT = 50;
	private static final int MAX_SCANS = 10;
	private static final UUID NOBODY = new UUID(0, 0);

	private final FeedItemRepository feed;
	private final ProofRepository proofs;
	private final ProofVerificationRepository verifications;
	private final HypeRepository hypes;
	private final CommentRepository comments;
	private final CheckpointRepository checkpoints;
	private final QuestCompletionRepository completions;
	private final UserQuestRepository userQuests;
	private final TransformationRepository transformations;
	private final ReportRepository reports;
	private final UserRepository userRepository;
	private final UserService users;
	private final SocialService social;
	private final FeedAccess access;
	private final GoalService goals;
	private final TodayService today;
	private final ImageCheck imageCheck;
	private final PushService push;
	private final NotificationService notifications;
	private final Clock clock;

	public FeedService(FeedItemRepository feed, ProofRepository proofs, ProofVerificationRepository verifications, HypeRepository hypes,
			CommentRepository comments, CheckpointRepository checkpoints, QuestCompletionRepository completions,
			UserQuestRepository userQuests, TransformationRepository transformations, ReportRepository reports,
			UserRepository userRepository, UserService users, SocialService social, FeedAccess access, GoalService goals,
			TodayService today, ImageCheck imageCheck, PushService push, NotificationService notifications, Clock clock) {
		this.feed = feed;
		this.proofs = proofs;
		this.verifications = verifications;
		this.hypes = hypes;
		this.comments = comments;
		this.checkpoints = checkpoints;
		this.completions = completions;
		this.userQuests = userQuests;
		this.transformations = transformations;
		this.reports = reports;
		this.userRepository = userRepository;
		this.users = users;
		this.social = social;
		this.access = access;
		this.goals = goals;
		this.today = today;
		this.imageCheck = imageCheck;
		this.push = push;
		this.notifications = notifications;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public Paged<FeedItemDto> list(UUID userId, FeedScope scope, Instant before, String cursor, Integer limit) {
		User me = users.get(userId);
		users.requirePro(me, "Feed");
		int size = limit == null ? 20 : Math.max(1, Math.min(MAX_LIMIT, limit));
		Viewer viewer = access.viewer(me);
		Set<UUID> hidden = withNobody(viewer.hiddenUsers());
		Set<UUID> friends = withNobody(viewer.friendIds());
		Set<UUID> authors = withNobody(viewer.friendIds());
		authors.add(userId);
		Instant now = clock.instant();
		Instant renewing = now.minus(User.RENEWAL_LEEWAY);
		return scanPages(viewer, Cursor.start(cursor, before, now), size, from -> switch (scope) {
			case EVERYONE -> feed.everyonePage(userId, hidden, now, renewing, from.at(), from.id(), size);
			case TO_VERIFY -> feed.toVerifyPage(userId, friends, hidden, now, renewing, from.at(), from.id(), size);
			case FRIENDS -> feed.friendsPage(userId, authors, hidden, now, renewing, from.at(), from.id(), size);
		});
	}

	@Transactional(readOnly = true)
	public Paged<FeedItemDto> userFeed(UUID userId, UUID authorId, String cursor, Integer limit) {
		User me = users.get(userId);
		User author = social.visibleUser(me, authorId);
		int size = limit == null ? 20 : Math.max(1, Math.min(MAX_LIMIT, limit));
		Viewer viewer = access.viewer(me);
		Set<UUID> hidden = withNobody(viewer.hiddenUsers());
		boolean friend = viewer.friendIds().contains(author.id);
		Instant now = clock.instant();
		Instant renewing = now.minus(User.RENEWAL_LEEWAY);
		return scanPages(viewer, Cursor.start(cursor, null, now), size,
				from -> feed.authorPage(userId, author.id, friend, hidden, now, renewing, from.at(), from.id(), size));
	}

	private Paged<FeedItemDto> scanPages(Viewer viewer, Cursor start, int size, Function<Cursor, List<FeedItem>> pages) {
		Cursor from = start;
		List<FeedItem> visible = new ArrayList<>();
		String next = null;
		for (int scan = 0; scan < MAX_SCANS; scan++) {
			List<FeedItem> page = pages.apply(from);
			Set<UUID> allowed = access.filter(viewer, page).stream().map(i -> i.id).collect(Collectors.toSet());
			for (FeedItem item : page) {
				from = Cursor.after(item.createdAt, item.id);
				if (allowed.contains(item.id)) {
					visible.add(item);
					if (visible.size() == size) {
						break;
					}
				}
			}
			if (visible.size() == size || (page.size() == size && scan == MAX_SCANS - 1)) {
				next = from.toString();
				break;
			}
			if (page.size() < size) {
				break;
			}
		}
		return new Paged<>(toDtos(viewer, visible), next);
	}

	@Transactional(readOnly = true)
	public FeedItemDto item(UUID userId, UUID feedItemId) {
		User me = users.get(userId);
		FeedItem item = feed.findById(feedItemId).orElseThrow(() -> ApiException.notFound("Post not found"));
		if (!item.userId.equals(userId)) {
			users.requirePro(me, "Feed");
		}
		Viewer viewer = access.viewer(me);
		if (!access.canSee(viewer, item)) {
			throw ApiException.notFound("Post not found");
		}
		return toDtos(viewer, List.of(item)).getFirst();
	}

	@Transactional(readOnly = true)
	public CountDto pendingCount(UUID userId) {
		User me = users.get(userId);
		users.requirePro(me, "Feed");
		Viewer viewer = access.viewer(me);
		Instant now = clock.instant();
		return new CountDto(feed.countToVerify(userId, withNobody(viewer.friendIds()), withNobody(viewer.hiddenUsers()), now,
				now.minus(User.RENEWAL_LEEWAY)));
	}

	@Transactional
	public void delete(UUID userId, UUID feedItemId) {
		FeedItem item = ownItem(users.get(userId), feedItemId);
		if (item.transformationId != null) {
			transformations.findById(item.transformationId).ifPresent(t -> {
				t.visibility = PostVisibility.PRIVATE;
				t.updatedAt = clock.instant();
			});
		}
		if (item.proofId != null) {
			proofs.findForUpdate(item.proofId).ifPresent(proof -> reject(proof, false));
		}
		removePost(item);
	}

	private void removePost(FeedItem item) {
		reports.deleteCommentReportsOfPost(item.id);
		reports.deleteByTargetTypeAndTargetId(ReportTarget.POST, item.id);
		feed.delete(item);
	}

	@Transactional
	public FeedItemDto setPublic(UUID userId, UUID feedItemId, boolean isPublic) {
		User me = users.get(userId);
		FeedItem item = ownItem(me, feedItemId);
		Proof proof = item.proofId == null ? null : proofs.findById(item.proofId).orElse(null);
		if (isPublic) {
			users.requirePro(me, "Public posts");
		}
		if (item.transformationId != null) {
			Transformation t = transformations.findById(item.transformationId).orElseThrow(() -> ApiException.notFound("Post not found"));
			if (t.removedByModerator) {
				throw ApiException.conflict(Reported.REMOVED);
			}
			if (isPublic && t.visibility != PostVisibility.EVERYONE) {
				Reported.requireShareable(FeedAccess.moderation(t, item));
			}
			if (isPublic) {
				t.visibility = PostVisibility.EVERYONE;
			}
			else if (t.visibility == PostVisibility.EVERYONE) {
				t.visibility = PostVisibility.FRIENDS;
			}
			t.updatedAt = clock.instant();
			share(item, t.visibility == PostVisibility.EVERYONE);
		}
		else {
			if (isPublic && !item.isPublic) {
				Reported.requireShareable(FeedAccess.moderation(item, proof));
			}
			Checkpoint cp = item.checkpointId == null ? null : checkpoints.findById(item.checkpointId).orElse(null);
			if (cp != null) {
				goals.setVisibility(me, cp, proof, isPublic ? PostVisibility.EVERYONE
						: cp.visibility == PostVisibility.EVERYONE ? PostVisibility.FRIENDS : cp.visibility);
				item.isPublic = cp.visibility == PostVisibility.EVERYONE;
			}
			else {
				if (proof != null) {
					proof.isPublic = isPublic;
					feed.findByProofId(proof.id).forEach(other -> share(other, isPublic));
				}
				share(item, isPublic);
			}
		}
		return toDtos(access.viewer(me), List.of(item)).getFirst();
	}

	private void share(FeedItem item, boolean isPublic) {
		boolean wasPublic = item.isPublic;
		item.isPublic = isPublic;
		if (isPublic && !wasPublic) {
			imageCheck.screen(item);
		}
	}

	@Transactional
	public ProofViewDto withdraw(UUID userId, UUID proofId) {
		Proof proof = ownProof(userId, proofId);
		if (proof.status != ProofStatus.PENDING) {
			throw ApiException.conflict("Only a proof that is waiting for verification can be withdrawn");
		}
		proof.status = ProofStatus.WITHDRAWN;
		proof.isPublic = false;
		reopen(proof);
		feed.findByProofId(proof.id).forEach(this::removePost);
		return proof(userId, proofId);
	}

	@Transactional
	public ProofViewDto useAi(UUID userId, UUID proofId) {
		Proof proof = ownProof(userId, proofId);
		if (proof.status != ProofStatus.PENDING || proof.requiredVerifications <= 0) {
			throw ApiException.conflict("Only a proof that is waiting for verification can switch to the AI check");
		}
		if (clock.instant().isBefore(useAiFrom(proof))) {
			throw ApiException.conflict("You can switch to the AI check " + AI_FALLBACK_AFTER.toHours() + " hours after you submitted the proof");
		}
		proof.status = ProofStatus.VERIFIED;
		proof.requiredVerifications = 0;
		User owner = users.get(userId);
		if (proof.kind == ProofKind.CHECKPOINT) {
			Checkpoint cp = checkpoints.findById(proof.refId).orElseThrow(() -> ApiException.notFound("Milestone not found"));
			goals.clear(owner, goals.goalOf(cp), cp, proof);
		}
		else {
			today.checkedByAi(proof);
		}
		return proof(userId, proofId);
	}

	public static Instant useAiFrom(Proof proof) {
		return proof.createdAt.plus(AI_FALLBACK_AFTER);
	}

	private Proof ownProof(UUID userId, UUID proofId) {
		return proofs.findForUpdate(proofId).filter(p -> p.userId.equals(userId))
				.orElseThrow(() -> ApiException.notFound("Proof not found"));
	}

	private void reopen(Proof proof) {
		if (proof.kind == ProofKind.CHECKPOINT) {
			goals.reopen(proof);
		}
		else {
			today.reopen(proof);
		}
	}

	private FeedItem ownItem(User me, UUID feedItemId) {
		FeedItem item = feed.findById(feedItemId).orElseThrow(() -> ApiException.notFound("Post not found"));
		if (!item.userId.equals(me.id)) {
			if (!access.canSee(access.viewer(me), item)) {
				throw ApiException.notFound("Post not found");
			}
			throw ApiException.forbidden("You can only change your own posts");
		}
		return item;
	}

	@Transactional
	public void reject(Proof proof, boolean byModerator) {
		if (proof.status != ProofStatus.PENDING) {
			return;
		}
		proof.status = ProofStatus.REJECTED;
		proof.isPublic = false;
		reopen(proof);
		if (byModerator) {
			String text = "A moderator removed your proof. Upload a new one to finish it.";
			notifications.notify(proof.userId, NotificationType.PROOF_REJECTED, null, null, proof.id, null, text);
			userRepository.findById(proof.userId).ifPresent(owner -> push.notify(owner, PushType.PROOF_REJECTED, "Proof removed", text,
					Map.of("proofId", proof.id.toString())));
		}
	}

	@Transactional
	public FeedItemDto verify(UUID userId, UUID proofId) {
		User me = users.get(userId);
		users.requirePro(me, "Community verification");
		Proof proof = proofs.findForUpdate(proofId).orElseThrow(() -> ApiException.notFound("Proof not found"));
		Viewer viewer = access.viewer(me);
		if (viewer.hiddenUsers().contains(proof.userId) || proof.status == ProofStatus.REJECTED || proof.status == ProofStatus.WITHDRAWN) {
			throw ApiException.notFound("Proof not found");
		}
		if (proof.userId.equals(userId)) {
			throw ApiException.forbidden("You can't verify your own proof");
		}
		if (!proof.isPublic && !social.areFriends(userId, proof.userId)) {
			throw ApiException.forbidden("Only friends can verify this proof");
		}
		FeedItem item = feed.findFirstByProofIdOrderByCreatedAtAsc(proofId).filter(i -> access.canSee(viewer, i))
				.orElseThrow(() -> ApiException.notFound("Proof not found"));
		if (proof.status != ProofStatus.PENDING || proof.requiredVerifications <= 0) {
			throw ApiException.conflict("Proof is already verified");
		}
		if (verifications.existsByProofIdAndUserId(proofId, userId)) {
			throw ApiException.conflict("You already verified this proof");
		}
		ProofVerification verification = new ProofVerification();
		verification.proofId = proofId;
		verification.userId = userId;
		verification.createdAt = clock.instant();
		verifications.save(verification);
		proof.verifiedCount = (int) verifications.countByProofId(proofId);
		User owner = users.get(proof.userId);
		String progress = proof.verifiedCount + "/" + proof.requiredVerifications + " verifies";
		notifications.notify(owner.id, NotificationType.VERIFY, userId, item.id, proof.id, null, progress);
		if (proof.verifiedCount >= proof.requiredVerifications) {
			proof.status = ProofStatus.VERIFIED;
			complete(owner, proof);
			notifications.notify(owner.id, NotificationType.PROOF_VERIFIED, null, item.id, proof.id, null, item.title);
			push.notify(owner, PushType.VERIFIED, "Proof verified",
					"Your community verified your proof " + proof.verifiedCount + "/" + proof.requiredVerifications,
					Map.of("proofId", proof.id.toString(), "completed", "true"));
		}
		else {
			push.notify(owner, PushType.VERIFIED, me.displayName + " verified your proof", progress,
					Map.of("proofId", proof.id.toString(), "completed", "false"));
		}
		return toDtos(viewer, List.of(item)).getFirst();
	}

	@Transactional(readOnly = true)
	public ProofViewDto proof(UUID userId, UUID proofId) {
		User me = users.get(userId);
		Proof proof = proofs.findById(proofId).orElseThrow(() -> ApiException.notFound("Proof not found"));
		User owner = userRepository.findById(proof.userId).orElseThrow(() -> ApiException.notFound("Proof not found"));
		if (!owner.id.equals(userId)) {
			users.requirePro(me, "Community verification");
		}
		Viewer viewer = access.viewer(me);
		if (viewer.hiddenUsers().contains(owner.id)) {
			throw ApiException.notFound("Proof not found");
		}
		Relation relation = social.relation(userId, owner.id);
		FeedItem item = feed.findFirstByProofIdOrderByCreatedAtAsc(proofId).orElse(null);
		FeedItemDto post = null;
		HiddenReason reason = null;
		if (item != null && access.canSee(viewer, item)) {
			post = toDtos(viewer, List.of(item)).getFirst();
		}
		else if (relation == Relation.SELF) {
			post = standalone(me, viewer.friendIds(), owner, proof);
		}
		else if (proof.status == ProofStatus.REJECTED || item == null || !users.isPro(owner)) {
			reason = HiddenReason.REMOVED;
		}
		else if (item.hidden) {
			reason = HiddenReason.UNDER_REVIEW;
		}
		else {
			reason = item.isPublic || relation == Relation.FRIEND ? HiddenReason.REMOVED : HiddenReason.FRIENDS_ONLY;
		}
		boolean self = relation == Relation.SELF;
		Instant aiFrom = self && proof.status == ProofStatus.PENDING && proof.requiredVerifications > 0 ? useAiFrom(proof) : null;
		return new ProofViewDto(proof.id, proof.kind, proof.status, UserService.summary(owner), relation, post != null, post, reason,
				self ? access.moderation(proof) : null, aiFrom);
	}

	private FeedItemDto standalone(User me, Set<UUID> friendIds, User owner, Proof proof) {
		FeedType type = FeedType.QUEST_PROOF;
		String title = "Proof";
		String subtitle = null;
		Double delta = null;
		String unit = null;
		Double value = null;
		if (proof.kind == ProofKind.CHECKPOINT) {
			Checkpoint cp = checkpoints.findById(proof.refId).orElse(null);
			if (cp != null) {
				Goal goal = goals.goalOf(cp);
				boolean cleared = proof.status == ProofStatus.VERIFIED;
				type = cleared ? FeedType.CHECKPOINT_CLEARED : FeedType.CHECKPOINT_PROOF;
				title = (cleared ? "Cleared milestone " : "Reached milestone ") + cp.index;
				subtitle = cp.rewardTitle == null ? null : (cleared ? "Unlocked: " : "Reward: ") + cp.rewardTitle;
				delta = CheckpointPlanner.round1(cp.targetValue - goal.startValue);
				unit = goal.unit;
			}
		}
		else {
			QuestCompletion completion = completions.findById(proof.refId).orElse(null);
			if (completion != null) {
				subtitle = completion.summary;
				UserQuest quest = userQuests.findById(completion.userQuestId).orElse(null);
				if (quest != null) {
					title = quest.name;
					if (quest.weightValued() && completion.value != null) {
						value = completion.value;
						unit = "kg";
					}
				}
			}
		}
		return new FeedItemDto(null, type, UserService.summary(owner), proof.createdAt, proof.photoUrl, title, subtitle, delta, value, unit,
				proof.id, verificationInfo(me, friendIds, proof, verifications.existsByProofIdAndUserId(proof.id, me.id)), 0, false, 0, null,
				false, aiChecked(proof), proof.isPublic, ModerationState.of(proof.removedByModerator, false));
	}

	private static VerificationInfo verificationInfo(User me, Set<UUID> friendIds, Proof proof, boolean mine) {
		if (proof.requiredVerifications <= 0) {
			return null;
		}
		boolean canVerify = proof.status == ProofStatus.PENDING && !proof.userId.equals(me.id) && !mine
				&& (proof.isPublic || friendIds.contains(proof.userId));
		return new VerificationInfo(proof.requiredVerifications, proof.verifiedCount, mine, canVerify);
	}

	private static boolean aiChecked(Proof proof) {
		return proof != null && proof.aiChecked;
	}

	@Transactional
	public FeedItemDto hype(UUID userId, UUID feedItemId) {
		User me = users.get(userId);
		users.requirePro(me, "Hype");
		FeedItem item = feed.findById(feedItemId).orElseThrow(() -> ApiException.notFound("Feed item not found"));
		Viewer viewer = access.viewer(me);
		if (!access.canSee(viewer, item)) {
			throw ApiException.notFound("Feed item not found");
		}
		if (hypes.existsById(new Hype.Key(item.id, userId))) {
			hypes.remove(item.id, userId);
			notifications.hide(NotificationType.HYPE, userId, item.id);
		}
		else if (hypes.insertIfAbsent(item.id, userId, clock.instant()) > 0 && !item.userId.equals(userId)
				&& notifications.notifyOnce(item.userId, NotificationType.HYPE, userId, item.id, item.proofId, item.title)) {
			userRepository.findById(item.userId).ifPresent(owner -> push.notify(owner, PushType.HYPE,
					me.displayName + " hyped your post", item.title, Map.of("feedItemId", item.id.toString())));
		}
		return toDtos(viewer, List.of(item)).getFirst();
	}

	private void complete(User owner, Proof proof) {
		if (proof.kind == ProofKind.CHECKPOINT) {
			Checkpoint cp = checkpoints.findById(proof.refId).orElseThrow(() -> ApiException.notFound("Milestone not found"));
			goals.clear(owner, goals.goalOf(cp), cp, proof);
		}
		else {
			today.markVerified(proof);
		}
	}

	private Map<UUID, Integer> commentCounts(List<UUID> itemIds, Set<UUID> hiddenUsers) {
		Map<UUID, Integer> counts = new HashMap<>();
		if (itemIds.isEmpty()) {
			return counts;
		}
		for (Object[] row : comments.countVisibleByFeedItemIds(itemIds, withNobody(hiddenUsers))) {
			counts.put((UUID) row[0], ((Number) row[1]).intValue());
		}
		return counts;
	}

	private static Set<UUID> withNobody(Collection<UUID> ids) {
		Set<UUID> result = new HashSet<>(ids);
		result.add(NOBODY);
		return result;
	}

	private List<FeedItemDto> toDtos(Viewer viewer, List<FeedItem> items) {
		if (items.isEmpty()) {
			return List.of();
		}
		User me = viewer.me();
		Set<UUID> authorIds = items.stream().map(i -> i.userId).collect(Collectors.toSet());
		Map<UUID, User> authors = userRepository.findByIdIn(authorIds).stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
		List<UUID> itemIds = items.stream().map(i -> i.id).toList();
		List<Hype> allHypes = hypes.findByFeedItemIdIn(itemIds).stream().filter(h -> !viewer.hiddenUsers().contains(h.userId)).toList();
		Map<UUID, Long> hypeCounts = allHypes.stream().collect(Collectors.groupingBy(h -> h.feedItemId, Collectors.counting()));
		Set<UUID> hypedByMe = allHypes.stream().filter(h -> h.userId.equals(me.id)).map(h -> h.feedItemId).collect(Collectors.toSet());
		Map<UUID, Integer> commentCounts = commentCounts(itemIds, viewer.hiddenUsers());
		Map<UUID, Transformation> transformations = access.transformationsOf(items);
		List<UUID> proofIds = items.stream().map(i -> i.proofId).filter(Objects::nonNull).distinct().toList();
		Map<UUID, Proof> proofById = proofs.findAllById(proofIds).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		Set<UUID> verifiedByMe = proofIds.isEmpty() ? Set.of()
				: verifications.findByUserIdAndProofIdIn(me.id, proofIds).stream().map(v -> v.proofId).collect(Collectors.toSet());
		List<FeedItemDto> result = new ArrayList<>();
		for (FeedItem item : items) {
			User author = authors.get(item.userId);
			if (author == null) {
				continue;
			}
			Proof proof = item.proofId == null ? null : proofById.get(item.proofId);
			VerificationInfo verification = proof == null ? null
					: verificationInfo(me, viewer.friendIds(), proof, verifiedByMe.contains(proof.id));
			Transformation t = item.transformationId == null ? null : transformations.get(item.transformationId);
			TransformationView view = t == null ? null
					: new TransformationView(t.layout, t.beforeUrl, t.afterUrl, t.beforeCaption, t.afterCaption);
			result.add(new FeedItemDto(item.id, item.type, UserService.summary(author), item.createdAt, item.photoUrl, item.title,
					item.subtitle, item.deltaValue, item.value, item.unit, item.proofId, verification,
					hypeCounts.getOrDefault(item.id, 0L).intValue(), hypedByMe.contains(item.id), commentCounts.getOrDefault(item.id, 0), view,
					item.hidden, aiChecked(proof), item.isPublic, !item.userId.equals(me.id) ? null
							: t != null ? FeedAccess.moderation(t, item) : FeedAccess.moderation(item, proof)));
		}
		return result;
	}
}
