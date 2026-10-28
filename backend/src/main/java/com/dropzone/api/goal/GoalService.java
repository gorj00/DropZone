package com.dropzone.api.goal;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.CheckpointDto;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.GoalDto;
import com.dropzone.api.common.Dtos.GoalHistoryDto;
import com.dropzone.api.common.Dtos.MeasurementDto;
import com.dropzone.api.common.Dtos.PastGoalDto;
import com.dropzone.api.common.Dtos.PhotoCredit;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.ModerationState;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofKind;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.ProofStatus;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.Verification;
import com.dropzone.api.moderation.ImageCheck;
import com.dropzone.api.moderation.Reported;
import com.dropzone.api.progress.ProgressService;
import com.dropzone.api.rules.AiCheck;
import com.dropzone.api.rules.CheckpointPlanner;
import com.dropzone.api.social.VerifyRequests;
import com.dropzone.api.storage.PhotoUrls;
import com.dropzone.api.storage.UploadCleanup;
import com.dropzone.api.user.UserService;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
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
public class GoalService {

	public static final int COMMUNITY_VERIFICATIONS = 3;
	static final int MAX_CREDIT_NAME = 120;
	static final String PRIVATE_COMMUNITY = "Community verification needs a milestone shared with friends or everyone";
	static final String PENDING_PRIVATE = "A proof of this milestone is waiting for verification. Withdraw it before you make the milestone private.";
	private static final String UNSPLASH_SITE = "unsplash.com";

	private final GoalRepository goals;
	private final CheckpointRepository checkpoints;
	private final ProofRepository proofs;
	private final FeedItemRepository feed;
	private final UserService users;
	private final VerifyRequests verifyRequests;
	private final ImageCheck imageCheck;
	private final ProgressService progress;
	private final PhotoUrls photoUrls;
	private final UploadCleanup uploads;
	private final Clock clock;

	public GoalService(GoalRepository goals, CheckpointRepository checkpoints, ProofRepository proofs, FeedItemRepository feed,
			UserService users, VerifyRequests verifyRequests, ImageCheck imageCheck, ProgressService progress, PhotoUrls photoUrls,
			UploadCleanup uploads, Clock clock) {
		this.goals = goals;
		this.checkpoints = checkpoints;
		this.proofs = proofs;
		this.feed = feed;
		this.users = users;
		this.verifyRequests = verifyRequests;
		this.imageCheck = imageCheck;
		this.progress = progress;
		this.photoUrls = photoUrls;
		this.uploads = uploads;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public GoalDto current(UUID userId) {
		return toDto(activeGoal(userId));
	}

	@Transactional(readOnly = true)
	public GoalHistoryDto history(UUID userId) {
		User user = users.get(userId);
		users.requirePro(user, "Stats");
		Goal goal = activeGoal(userId);
		LocalDate start = goal.createdAt.atZone(users.zone(user)).toLocalDate();
		LocalDate to = users.today(user).plusDays(1);
		return new GoalHistoryDto(start, progress.history(goal, start, to.isBefore(start) ? start : to));
	}

	@Transactional(readOnly = true)
	public List<PastGoalDto> pastGoals(UUID userId) {
		users.get(userId);
		List<Goal> past = goals.findByUserIdAndActiveFalseOrderByCreatedAtDesc(userId);
		if (past.isEmpty()) {
			return List.of();
		}
		Map<UUID, List<Checkpoint>> byGoal = checkpoints.findByGoalIdInOrderByIndexAsc(past.stream().map(g -> g.id).toList()).stream()
				.collect(Collectors.groupingBy(c -> c.goalId));
		return past.stream().map(g -> {
			List<Checkpoint> list = byGoal.getOrDefault(g.id, List.of());
			boolean reached = reached(list);
			int cleared = (int) list.stream().filter(c -> c.status == CheckpointStatus.CLEARED).count();
			return new PastGoalDto(g.id, g.path, g.metric, g.metricLabel, g.unit, g.startValue, g.goalValue, g.currentValue, g.createdAt,
					g.endedAt, reached ? list.getLast().clearedAt : null, reached, list.size(), cleared);
		}).toList();
	}

	@Transactional
	public GoalDto newGoal(UUID userId, Requests.NewGoal req) {
		User user = users.lock(userId);
		if (!user.onboarded || user.path == null) {
			throw ApiException.conflict("Finish onboarding first");
		}
		Goal old = goals.findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(userId).orElse(null);
		if (old != null && !reached(checkpoints.findByGoalIdOrderByIndexAsc(old.id))) {
			throw ApiException.conflict("Reach your current goal before you start a new one");
		}
		Metric metric = req.metric() != null ? req.metric() : old != null ? old.metric : Metric.WEIGHT;
		boolean sameMetric = old != null && old.metric == metric;
		if (req.startValue() == null && !sameMetric) {
			throw ApiException.validation("startValue is required when the metric changes");
		}
		double start = req.startValue() != null ? req.startValue() : old.currentValue;
		String unit = req.unit() == null || req.unit().isBlank() ? MetricBounds.unit(metric) : req.unit().trim();
		String label = req.metricLabel() != null ? blankToNull(req.metricLabel()) : sameMetric ? old.metricLabel : null;
		validate(user.path, metric, unit, start, req.goalValue());
		Goal goal = create(user, user.path, metric, label, unit, start, req.goalValue(), req.checkpoints(),
				!sameMetric || req.startValue() != null);
		return toDto(goal);
	}

	public static void validate(Path path, Metric metric, String unit, double start, double target) {
		if (path == Path.LOSE && metric != Metric.WEIGHT) {
			throw ApiException.validation("LOSE goals always track WEIGHT");
		}
		MetricBounds.requireUnit(metric, unit);
		MetricBounds.check(metric, start, "startValue");
		MetricBounds.check(metric, target, "goalValue");
		if (path == Path.LOSE && target >= start) {
			throw ApiException.validation("goalValue must be below startValue when losing");
		}
		if (path == Path.GAIN && target <= start) {
			throw ApiException.validation("goalValue must be above startValue when gaining");
		}
		double gap = MetricBounds.minGap(metric);
		if (!CheckpointPlanner.fits(start, target, CheckpointPlanner.MIN, gap)) {
			throw ApiException.validation("goalValue must be at least " + MetricBounds.format(metric, gap * CheckpointPlanner.MIN)
					+ " away from startValue");
		}
	}

	@Transactional
	public GoalDto logProgress(UUID userId, Requests.GoalProgress req) {
		User user = users.lock(userId);
		Goal goal = activeGoal(userId);
		if (goal.metric == Metric.WEIGHT) {
			throw ApiException.conflict("Weight goals move with weigh-ins");
		}
		LocalDate day = ProgressService.checkDay(req.date(), users.today(user));
		MetricBounds.check(goal.metric, req.value(), "value");
		progress.recordMeasurement(user.id, goal.metric, day, req.value());
		return toDto(goal);
	}

	@Transactional(readOnly = true)
	public List<MeasurementDto> measurements(UUID userId) {
		return progress.measurements(userId, activeGoal(userId).metric);
	}

	@Transactional
	public void deleteMeasurement(UUID userId, UUID measurementId) {
		users.lock(userId);
		progress.deleteMeasurement(userId, measurementId);
	}

	@Transactional
	public GoalDto updateGoal(UUID userId, Requests.UpdateGoal req) {
		Goal goal = activeGoal(userId);
		List<Checkpoint> list = checkpoints.findByGoalIdOrderByIndexAsc(goal.id);
		MetricBounds.check(goal.metric, req.startValue(), "startValue");
		MetricBounds.check(goal.metric, req.goalValue(), "goalValue");
		double start = goal.startValue;
		double target = req.goalValue() == null ? goal.goalValue : req.goalValue();
		if (req.startValue() != null && Math.abs(req.startValue() - goal.startValue) > 1e-9) {
			if (list.stream().anyMatch(c -> c.status == CheckpointStatus.CLEARED)) {
				throw ApiException.conflict("The start value can't change once a milestone is cleared");
			}
			start = req.startValue();
		}
		respread(goal, list, start, target);
		if (Math.abs(goal.currentValue - goal.startValue) < 1e-9) {
			goal.currentValue = start;
		}
		goal.startValue = start;
		goal.goalValue = target;
		return toDto(goal);
	}

	private void respread(Goal goal, List<Checkpoint> list, double start, double target) {
		if (!beyond(goal.path, target, start)) {
			throw ApiException.validation(goal.path == Path.LOSE ? "The target must be below the start value"
					: "The target must be above the start value");
		}
		Checkpoint lastFixed = null;
		for (Checkpoint cp : list) {
			if (cp.submitted()) {
				lastFixed = cp;
			}
		}
		if (lastFixed != null && !beyond(goal.path, list.get(0).targetValue, start)) {
			throw ApiException.validation("The start value must stay " + (goal.path == Path.LOSE ? "above " : "below ")
					+ "milestone 1 (" + fmt(list.get(0).targetValue, goal.unit) + ")");
		}
		int fixedIndex = lastFixed == null ? 0 : lastFixed.index;
		List<Checkpoint> open = list.stream().filter(c -> c.index > fixedIndex).toList();
		if (open.isEmpty()) {
			throw ApiException.conflict("Every milestone is already reached");
		}
		double base = lastFixed == null ? start : lastFixed.targetValue;
		String from = lastFixed == null ? "the start" : "milestone " + fixedIndex;
		if (!beyond(goal.path, target, base)) {
			throw ApiException.validation("The target must be " + direction(goal.path) + from + " (" + fmt(base, goal.unit) + ")");
		}
		double gap = MetricBounds.minGap(goal.metric);
		if (!CheckpointPlanner.fits(base, target, open.size(), gap)) {
			throw ApiException.validation("Milestones must be at least " + MetricBounds.format(goal.metric, gap) + " apart: the target must be "
					+ "at least " + MetricBounds.format(goal.metric, gap * open.size()) + " " + direction(goal.path) + from + " ("
					+ fmt(base, goal.unit) + ")");
		}
		List<Double> targets = CheckpointPlanner.spread(base, target, open.size());
		for (int j = 0; j < open.size(); j++) {
			open.get(j).targetValue = targets.get(j);
		}
	}

	private void setTarget(Goal goal, Checkpoint cp, double value) {
		if (cp.submitted()) {
			throw ApiException.conflict("This milestone is already done, its target can't change");
		}
		List<Checkpoint> list = checkpoints.findByGoalIdOrderByIndexAsc(goal.id);
		if (cp.index == list.size()) {
			respread(goal, list, goal.startValue, value);
			goal.goalValue = value;
			return;
		}
		double previous = cp.index == 1 ? goal.startValue : list.get(cp.index - 2).targetValue;
		double next = list.get(cp.index).targetValue;
		double gap = MetricBounds.minGap(goal.metric);
		if (!CheckpointPlanner.spaced(previous, List.of(value, next), gap)) {
			throw ApiException.validation("Milestone " + cp.index + " must be between " + fmt(previous, goal.unit) + " and "
					+ fmt(next, goal.unit) + ", at least " + MetricBounds.format(goal.metric, gap) + " from each");
		}
		cp.targetValue = value;
	}

	private static boolean beyond(Path path, double value, double reference) {
		return path == Path.LOSE ? value < reference - 1e-9 : value > reference + 1e-9;
	}

	private static String direction(Path path) {
		return path == Path.LOSE ? "below " : "above ";
	}

	private static String fmt(double value, String unit) {
		return String.format(java.util.Locale.ROOT, "%.1f %s", value, unit);
	}

	@Transactional
	public Goal create(User user, Requests.Onboarding req) {
		return create(user, req.path(), req.metric(), blankToNull(req.metricLabel()), req.unit().trim(), req.startValue(), req.goalValue(),
				req.checkpoints(), true);
	}

	private Goal create(User user, Path path, Metric metric, String metricLabel, String unit, double start, double target, int count,
			boolean recordStart) {
		Instant now = clock.instant();
		List<Goal> previous = goals.findByUserIdAndActiveTrue(user.id);
		for (Goal old : previous) {
			old.active = false;
			old.endedAt = now;
		}
		if (!previous.isEmpty()) {
			goals.flush();
		}
		boolean pro = users.isPro(user);
		Goal goal = new Goal();
		goal.id = UUID.randomUUID();
		goal.userId = user.id;
		goal.path = path;
		goal.metric = metric;
		goal.metricLabel = metricLabel;
		goal.unit = unit;
		goal.startValue = start;
		goal.goalValue = target;
		goal.currentValue = start;
		goal.createdAt = now;
		goal = goals.save(goal);
		PostVisibility visibility = pro ? defaultVisibility(user) : PostVisibility.PRIVATE;
		Verification verification = pro && visibility != PostVisibility.PRIVATE ? user.defaultVerification : Verification.AI;
		List<Double> targets = CheckpointPlanner.plan(goal.startValue, goal.goalValue, count, MetricBounds.minGap(goal.metric));
		for (int i = 0; i < targets.size(); i++) {
			Checkpoint cp = new Checkpoint();
			cp.id = UUID.randomUUID();
			cp.goalId = goal.id;
			cp.index = i + 1;
			cp.targetValue = targets.get(i);
			cp.setVisibility(visibility);
			cp.verification = verification;
			cp.status = i == 0 ? CheckpointStatus.ACTIVE : CheckpointStatus.LOCKED;
			checkpoints.save(cp);
		}
		if (recordStart) {
			progress.recordMeasurement(user.id, goal.metric, users.today(user), goal.startValue);
		}
		return goal;
	}

	public static PostVisibility defaultVisibility(User user) {
		if (user.publicByDefault) {
			return PostVisibility.EVERYONE;
		}
		return user.defaultVerification == Verification.COMMUNITY ? PostVisibility.FRIENDS : PostVisibility.PRIVATE;
	}

	@Transactional
	public CountDto applyDefaults(UUID userId) {
		User user = users.get(userId);
		PostVisibility visibility = defaultVisibility(user);
		Verification verification = visibility == PostVisibility.PRIVATE ? Verification.AI : user.defaultVerification;
		if (visibility != PostVisibility.PRIVATE) {
			users.requirePro(user, "Public milestone rewards");
		}
		Goal goal = activeGoal(userId);
		int changed = 0;
		for (Checkpoint cp : checkpoints.findByGoalIdOrderByIndexAsc(goal.id)) {
			if (cp.submitted() || (cp.visibility == visibility && cp.verification == verification)) {
				continue;
			}
			applyVisibility(cp, visibility);
			cp.verification = verification;
			changed++;
		}
		return new CountDto(changed);
	}

	@Transactional
	public CheckpointDto update(UUID userId, UUID checkpointId, Map<String, Object> body) {
		User user = users.get(userId);
		boolean pro = users.isPro(user);
		Checkpoint cp = checkpoints.findById(checkpointId).orElseThrow(() -> ApiException.notFound("Milestone not found"));
		Goal goal = ownedGoal(userId, cp);
		Proof current = cp.proofId == null ? null : proofs.findById(cp.proofId).orElse(null);
		if (body.containsKey("rewardTitle")) {
			cp.rewardTitle = optionalString(body.get("rewardTitle"), "rewardTitle", 80);
		}
		if (body.containsKey("rewardImageUrl")) {
			String previous = cp.rewardImageUrl;
			String next = optionalString(body.get("rewardImageUrl"), "rewardImageUrl", Requests.MAX_URL);
			if (next != null) {
				next = photoUrls.canonical(next);
			}
			if (next != null && !next.equals(previous)) {
				next = photoUrls.rewardImage(userId, next);
			}
			cp.rewardImageUrl = next;
			if (!Objects.equals(previous, next)) {
				cp.rewardImageCreditName = null;
				cp.rewardImageCreditLink = null;
			}
			if (previous != null && !previous.equals(next)) {
				uploads.deleteIfUnused(previous);
			}
		}
		if (body.containsKey("rewardImageCredit")) {
			PhotoCredit credit = parseCredit(body.get("rewardImageCredit"));
			if (credit != null && (cp.rewardImageUrl == null || !PhotoUrls.isUnsplash(cp.rewardImageUrl))) {
				throw ApiException.validation("rewardImageCredit is only for Unsplash reward photos");
			}
			cp.rewardImageCreditName = credit == null ? null : credit.name();
			cp.rewardImageCreditLink = credit == null ? null : credit.link();
		}
		Verification shown = shownVerification(cp, current, pro);
		Verification requested = body.containsKey("verification") ? parseVerification(body.get("verification")) : shown;
		boolean verificationChange = requested != shown;
		if (verificationChange) {
			if (cp.submitted()) {
				throw ApiException.conflict("Verification can't change once a proof was submitted");
			}
			if (requested == Verification.COMMUNITY) {
				users.requirePro(user, "Community verification");
			}
		}
		PostVisibility visibility = cp.visibility;
		if (body.containsKey("visibility")) {
			visibility = parseVisibility(body.get("visibility"));
		}
		else if (body.containsKey("isPublic")) {
			if (!(body.get("isPublic") instanceof Boolean isPublic)) {
				throw ApiException.validation("isPublic must be a boolean");
			}
			if (isPublic != (cp.visibility == PostVisibility.EVERYONE)) {
				visibility = isPublic ? PostVisibility.EVERYONE
						: requested == Verification.COMMUNITY ? PostVisibility.FRIENDS : PostVisibility.PRIVATE;
			}
		}
		Verification verification = requested;
		if (visibility == PostVisibility.PRIVATE && verification == Verification.COMMUNITY && !cp.submitted()) {
			if (verificationChange) {
				throw ApiException.validation(PRIVATE_COMMUNITY);
			}
			verification = Verification.AI;
		}
		if (visibility != cp.visibility) {
			setVisibility(user, cp, current, visibility);
		}
		if (verification != shown) {
			cp.verification = verification;
		}
		if (body.containsKey("deadline")) {
			cp.deadline = parseDate(body.get("deadline"));
		}
		if (body.containsKey("targetValue")) {
			if (!(body.get("targetValue") instanceof Number number) || number.doubleValue() <= 0) {
				throw ApiException.validation("targetValue must be a positive number");
			}
			MetricBounds.check(goal.metric, number.doubleValue(), "targetValue");
			if (Math.abs(number.doubleValue() - cp.targetValue) > 1e-9) {
				setTarget(goal, cp, number.doubleValue());
			}
		}
		return toDto(goal, cp, current, pro);
	}

	public void setVisibility(User user, Checkpoint cp, Proof proof, PostVisibility visibility) {
		if (visibility == cp.visibility) {
			return;
		}
		if (visibility.compareTo(cp.visibility) > 0) {
			users.requirePro(user, "Public milestone rewards");
			Reported.requireShareable(moderation(cp, proof));
		}
		if (visibility == PostVisibility.PRIVATE && cp.status == CheckpointStatus.PENDING_VERIFICATION) {
			throw ApiException.conflict(PENDING_PRIVATE);
		}
		applyVisibility(cp, visibility);
	}

	private void applyVisibility(Checkpoint cp, PostVisibility visibility) {
		cp.setVisibility(visibility);
		boolean everyone = visibility == PostVisibility.EVERYONE;
		proofs.findByKindAndRefId(ProofKind.CHECKPOINT, cp.id).forEach(proof -> proof.isPublic = everyone);
		feed.findByCheckpointId(cp.id).forEach(item -> {
			boolean wasPublic = item.isPublic;
			item.isPublic = everyone;
			if (everyone && !wasPublic) {
				imageCheck.screen(item);
			}
		});
	}

	@Transactional
	public CheckpointDto submitProof(UUID userId, UUID checkpointId, Requests.CheckpointProof req) {
		User user = users.lock(userId);
		Checkpoint cp = checkpoints.findForUpdate(checkpointId).orElseThrow(() -> ApiException.notFound("Milestone not found"));
		Goal goal = ownedGoal(userId, cp);
		if (cp.status != CheckpointStatus.ACTIVE) {
			throw ApiException.conflict("Milestone is not active");
		}
		MetricBounds.check(goal.metric, req.value(), "value");
		String photoUrl = photoUrls.ownUpload(userId, req.photoUrl(), "photoUrl");
		if (!goal.reached(req.value(), cp.targetValue, MetricBounds.tolerance(goal.metric, user.weightUnit, user.lengthUnit))) {
			throw ApiException.conflict("Value doesn't reach the milestone target yet");
		}
		boolean pro = users.isPro(user);
		boolean community = cp.verification == Verification.COMMUNITY && pro && cp.visibility != PostVisibility.PRIVATE;
		photoUrls.requireUnusedProofPhoto(photoUrl);
		LocalDate today = users.today(user);
		if (goal.metric == Metric.WEIGHT) {
			if (!progress.hasWeighIn(user, today)) {
				progress.recordWeight(user, today, req.value(), photoUrl, req.mlText());
			}
		}
		else {
			progress.recordMeasurement(user.id, goal.metric, today, req.value());
		}
		Proof proof = new Proof();
		proof.id = UUID.randomUUID();
		proof.userId = user.id;
		proof.kind = ProofKind.CHECKPOINT;
		proof.refId = cp.id;
		proof.photoUrl = photoUrl;
		proof.value = req.value();
		proof.mlLabels = req.mlLabels() == null ? new ArrayList<>() : new ArrayList<>(req.mlLabels());
		proof.mlText = req.mlText();
		proof.aiChecked = AiCheck.milestone(goal.metric, req.mlLabels(), req.mlText());
		proof.isPublic = cp.visibility == PostVisibility.EVERYONE;
		proof.createdAt = clock.instant();
		cp.proofId = proof.id;
		if (community) {
			proof.status = ProofStatus.PENDING;
			proof.requiredVerifications = COMMUNITY_VERIFICATIONS;
			proofs.save(proof);
			cp.status = CheckpointStatus.PENDING_VERIFICATION;
			FeedItem item = feedItem(user, goal, cp, proof, FeedType.CHECKPOINT_PROOF, "Reached milestone " + cp.index,
					cp.rewardTitle == null ? "Needs " + COMMUNITY_VERIFICATIONS + " verifies" : "Reward: " + cp.rewardTitle,
					proof.isPublic, proof.photoUrl);
			verifyRequests.send(user, proof, item, "Milestone " + cp.index + " proof is waiting for the community");
		}
		else {
			proof.status = ProofStatus.VERIFIED;
			proof.requiredVerifications = 0;
			proofs.save(proof);
			clear(user, goal, cp, proof);
		}
		return toDto(goal, cp, proof, pro);
	}

	@Transactional
	public void clear(User owner, Goal goal, Checkpoint cp, Proof proof) {
		if (!proof.id.equals(cp.proofId)
				|| (cp.status != CheckpointStatus.ACTIVE && cp.status != CheckpointStatus.PENDING_VERIFICATION)) {
			return;
		}
		cp.status = CheckpointStatus.CLEARED;
		cp.clearedAt = clock.instant();
		checkpoints.findByGoalIdOrderByIndexAsc(goal.id).stream()
				.filter(next -> next.index == cp.index + 1 && next.status == CheckpointStatus.LOCKED)
				.findFirst()
				.ifPresent(next -> next.status = CheckpointStatus.ACTIVE);
		if (cp.visibility != PostVisibility.PRIVATE && users.isPro(owner)) {
			feedItem(owner, goal, cp, proof, FeedType.CHECKPOINT_CLEARED, "Cleared milestone " + cp.index,
					cp.rewardTitle == null ? null : "Unlocked: " + cp.rewardTitle, cp.visibility == PostVisibility.EVERYONE,
					sharedPhoto(cp, proof));
		}
	}

	@Transactional
	public void reopen(Proof proof) {
		checkpoints.findForUpdate(proof.refId)
				.filter(cp -> proof.id.equals(cp.proofId) && cp.status == CheckpointStatus.PENDING_VERIFICATION)
				.ifPresent(cp -> {
					cp.status = CheckpointStatus.ACTIVE;
					cp.proofId = null;
				});
	}

	public String sharedPhoto(Checkpoint cp, Proof proof) {
		if (proof.requiredVerifications > 0) {
			return proof.photoUrl;
		}
		return cp.rewardImageUrl != null && photoUrls.isOwnUpload(proof.userId, cp.rewardImageUrl) ? cp.rewardImageUrl : null;
	}

	@Transactional(readOnly = true)
	public Goal goalOf(Checkpoint cp) {
		return goals.findById(cp.goalId).orElseThrow(() -> ApiException.notFound("Goal not found"));
	}

	public static boolean reached(List<Checkpoint> list) {
		return !list.isEmpty() && list.getLast().status == CheckpointStatus.CLEARED;
	}

	public GoalDto toDto(Goal goal) {
		User owner = users.get(goal.userId);
		boolean pro = users.isPro(owner);
		LocalDate today = users.today(owner);
		List<Checkpoint> list = checkpoints.findByGoalIdOrderByIndexAsc(goal.id);
		List<UUID> proofIds = list.stream().map(c -> c.proofId).filter(Objects::nonNull).toList();
		Map<UUID, Proof> byId = proofs.findAllById(proofIds).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		Set<UUID> underReview = list.isEmpty() ? Set.of()
				: new HashSet<>(feed.findHiddenCheckpointIds(list.stream().map(c -> c.id).toList()));
		double total = CheckpointPlanner.round1(Math.abs(goal.goalValue - goal.startValue));
		double signed = goal.path == Path.LOSE ? goal.startValue - goal.currentValue : goal.currentValue - goal.startValue;
		double achieved = CheckpointPlanner.round1(Math.max(0, Math.min(total, signed)));
		return new GoalDto(goal.id, goal.path, goal.metric, goal.metricLabel, goal.unit, goal.startValue, goal.goalValue,
				goal.currentValue, achieved, total,
				list.stream().map(c -> toDto(goal, c, byId.get(c.proofId), pro, today, underReview.contains(c.id))).toList(), reached(list));
	}

	public CheckpointDto toDto(Goal goal, Checkpoint cp, Proof proof, boolean pro) {
		return toDto(goal, cp, proof, pro, users.today(users.get(goal.userId)), feed.existsByCheckpointIdAndHiddenTrue(cp.id));
	}

	public static boolean overdue(Checkpoint cp, LocalDate today) {
		return cp.deadline != null && cp.deadline.isBefore(today) && cp.status != CheckpointStatus.CLEARED;
	}

	private ModerationState moderation(Checkpoint cp, Proof proof) {
		boolean removed = proof != null && proof.removedByModerator;
		return ModerationState.of(removed, !removed && feed.existsByCheckpointIdAndHiddenTrue(cp.id));
	}

	private CheckpointDto toDto(Goal goal, Checkpoint cp, Proof proof, boolean pro, LocalDate today, boolean underReview) {
		Verification verification = shownVerification(cp, proof, pro);
		int required = proof != null ? proof.requiredVerifications : verification == Verification.COMMUNITY ? COMMUNITY_VERIFICATIONS : 0;
		int verified = proof != null ? proof.verifiedCount : 0;
		PhotoCredit credit = cp.rewardImageCreditName == null ? null : new PhotoCredit(cp.rewardImageCreditName, cp.rewardImageCreditLink);
		ModerationState moderation = ModerationState.of(proof != null && proof.removedByModerator, underReview);
		return new CheckpointDto(cp.id, cp.index, cp.targetValue, CheckpointPlanner.round1(Math.abs(cp.targetValue - goal.startValue)),
				cp.rewardTitle, cp.rewardImageUrl, credit, cp.visibility == PostVisibility.EVERYONE, verification, cp.deadline, cp.status,
				cp.clearedAt, cp.proofId, verified, required, overdue(cp, today), cp.visibility, proof != null && proof.aiChecked, moderation);
	}

	private static Verification shownVerification(Checkpoint cp, Proof proof, boolean pro) {
		if (proof != null) {
			return proof.requiredVerifications > 0 ? Verification.COMMUNITY : Verification.AI;
		}
		return cp.verification == Verification.COMMUNITY && pro && cp.visibility != PostVisibility.PRIVATE ? Verification.COMMUNITY
				: Verification.AI;
	}

	private FeedItem feedItem(User user, Goal goal, Checkpoint cp, Proof proof, FeedType type, String title, String subtitle,
			boolean isPublic, String photoUrl) {
		FeedItem item = new FeedItem();
		item.id = UUID.randomUUID();
		item.userId = user.id;
		item.type = type;
		item.proofId = proof.id;
		item.checkpointId = cp.id;
		item.photoUrl = photoUrl;
		item.title = title;
		item.subtitle = subtitle;
		item.deltaValue = CheckpointPlanner.round1(cp.targetValue - goal.startValue);
		item.unit = goal.unit;
		item.isPublic = isPublic;
		item.createdAt = clock.instant();
		FeedItem saved = feed.save(item);
		imageCheck.screen(saved);
		return saved;
	}

	private Goal activeGoal(UUID userId) {
		return goals.findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(userId).orElseThrow(() -> ApiException.notFound("No goal yet"));
	}

	private Goal ownedGoal(UUID userId, Checkpoint cp) {
		return goals.findById(cp.goalId).filter(g -> g.userId.equals(userId) && g.active)
				.orElseThrow(() -> ApiException.notFound("Milestone not found"));
	}

	private static PhotoCredit parseCredit(Object value) {
		if (value == null) {
			return null;
		}
		if (!(value instanceof Map<?, ?> map)) {
			throw ApiException.validation("rewardImageCredit must be { name, link }");
		}
		String name = optionalString(map.get("name"), "rewardImageCredit.name", MAX_CREDIT_NAME);
		String link = optionalString(map.get("link"), "rewardImageCredit.link", Requests.MAX_URL);
		if (name == null || link == null || !isUnsplashPage(link)) {
			throw ApiException.validation("rewardImageCredit needs a name and an https://unsplash.com link");
		}
		return new PhotoCredit(name, link);
	}

	private static boolean isUnsplashPage(String link) {
		try {
			URI uri = new URI(link);
			String host = uri.getHost();
			return "https".equals(uri.getScheme()) && host != null && uri.getRawUserInfo() == null && uri.getPort() == -1
					&& (host.equals(UNSPLASH_SITE) || host.endsWith("." + UNSPLASH_SITE));
		}
		catch (URISyntaxException e) {
			return false;
		}
	}

	private static String optionalString(Object value, String field, int max) {
		if (value == null) {
			return null;
		}
		if (!(value instanceof String s)) {
			throw ApiException.validation(field + " must be a string");
		}
		String trimmed = s.trim();
		if (trimmed.length() > max) {
			throw ApiException.validation(field + " is too long");
		}
		return trimmed.isEmpty() ? null : trimmed;
	}

	private static Verification parseVerification(Object value) {
		try {
			return Verification.valueOf(String.valueOf(value));
		}
		catch (IllegalArgumentException e) {
			throw ApiException.validation("verification must be AI or COMMUNITY");
		}
	}

	private static PostVisibility parseVisibility(Object value) {
		try {
			return PostVisibility.valueOf(String.valueOf(value));
		}
		catch (IllegalArgumentException e) {
			throw ApiException.validation("visibility must be PRIVATE, FRIENDS or EVERYONE");
		}
	}

	private static LocalDate parseDate(Object value) {
		if (value == null) {
			return null;
		}
		try {
			return LocalDate.parse(String.valueOf(value));
		}
		catch (DateTimeParseException e) {
			throw ApiException.validation("deadline must be YYYY-MM-DD");
		}
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
