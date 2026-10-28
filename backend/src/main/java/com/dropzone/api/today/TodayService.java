package com.dropzone.api.today;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.FriendsCleared;
import com.dropzone.api.common.Dtos.TodayDto;
import com.dropzone.api.common.Dtos.TodayQuestDto;
import com.dropzone.api.common.Dtos.WeighInDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.AutoSource;
import com.dropzone.api.domain.CheckAudience;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.Exercise;
import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofKind;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.ProofStatus;
import com.dropzone.api.domain.ProofType;
import com.dropzone.api.domain.QuestCompletion;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.domain.WeighIn;
import com.dropzone.api.goal.GoalService;
import com.dropzone.api.goal.MetricBounds;
import com.dropzone.api.progress.ProgressService;
import com.dropzone.api.moderation.ImageCheck;
import com.dropzone.api.quest.QuestService;
import com.dropzone.api.rules.AiCheck;
import com.dropzone.api.rules.UnlockCalculator;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.social.VerifyRequests;
import com.dropzone.api.storage.PhotoUrls;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TodayService {

	public static final String WEIGH_IN = "WEIGH_IN";
	public static final String AI_VERIFIED = "AI verified";
	public static final String PHOTO_PROOF = "Photo proof";
	static final String AI_AFTER_NO_VERIFY = "AI-checked after no verification";
	static final String PHOTO_AFTER_NO_VERIFY = "Photo proof after no verification";
	static final int MAX_SLEEP_MINUTES = 1080;
	static final int MAX_LOG_KG = 500;
	private static final int MAX_FRIEND_AVATARS = 5;

	private final UserService users;
	private final ProgressService progress;
	private final UserQuestRepository quests;
	private final QuestCompletionRepository completions;
	private final ProofRepository proofs;
	private final FeedItemRepository feed;
	private final DailyResultRepository dailyResults;
	private final UserRepository userRepository;
	private final SocialService social;
	private final VerifyRequests verifyRequests;
	private final ImageCheck imageCheck;
	private final QuestService questService;
	private final PhotoUrls photoUrls;
	private final Clock clock;

	public TodayService(UserService users, ProgressService progress, UserQuestRepository quests, QuestCompletionRepository completions,
			ProofRepository proofs, FeedItemRepository feed, DailyResultRepository dailyResults, UserRepository userRepository,
			SocialService social, VerifyRequests verifyRequests, ImageCheck imageCheck, QuestService questService, PhotoUrls photoUrls,
			Clock clock) {
		this.users = users;
		this.progress = progress;
		this.quests = quests;
		this.completions = completions;
		this.proofs = proofs;
		this.feed = feed;
		this.dailyResults = dailyResults;
		this.userRepository = userRepository;
		this.social = social;
		this.verifyRequests = verifyRequests;
		this.imageCheck = imageCheck;
		this.questService = questService;
		this.photoUrls = photoUrls;
		this.clock = clock;
	}

	@Transactional
	public TodayDto today(UUID userId, LocalDate date) {
		User user = users.get(userId);
		LocalDate today = users.today(user);
		LocalDate day = date == null ? today : date;
		progress.refreshStreak(user, today);
		if (user.onboarded) {
			questService.ensureFreeQuests(user);
		}
		List<UserQuest> scheduled = progress.scheduled(user, day);
		Map<String, QuestCompletion> bySlot = completions.findByUserIdAndDay(user.id, day).stream()
				.collect(Collectors.toMap(c -> key(c.userQuestId, c.slot), Function.identity(), (a, b) -> a));
		List<UUID> proofIds = bySlot.values().stream().map(c -> c.proofId).filter(Objects::nonNull).toList();
		Map<UUID, Proof> proofById = proofs.findAllById(proofIds).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		List<TodayQuestDto> items = new ArrayList<>();
		int done = 0;
		int pending = 0;
		for (UserQuest quest : scheduled) {
			for (int slot = 1; slot <= quest.slots(); slot++) {
				QuestCompletion completion = bySlot.get(key(quest.id, slot));
				Proof proof = completion == null || completion.proofId == null ? null : proofById.get(completion.proofId);
				TodayQuestDto dto = toDto(quest, completion, proof, slot);
				if (dto.status() == QuestStatus.DONE) {
					done++;
				}
				else if (dto.status() == QuestStatus.PENDING) {
					pending++;
				}
				items.add(dto);
			}
		}
		int total = items.size();
		boolean pro = users.isPro(user);
		UnlockMode mode = users.effectiveUnlockMode(user);
		boolean kept = !pro && progress.clearedBeforeProEnded(user, day);
		UnlockCalculator.UnlockState unlock = kept ? UnlockCalculator.compute(UnlockMode.WHOLE_DAY, 1, 1, user.minutesPerQuest, day, users.zone(user))
				: UnlockCalculator.compute(mode, done + pending, total, user.minutesPerQuest, day, users.zone(user));
		boolean unlocked = unlock.unlocked() && UnlockCalculator.activeAt(unlock, day, users.zone(user), clock.instant());
		return new TodayDto(day, items, done, total, unlocked, unlock.unlockedUntil(), unlock.minutesEarned(),
				user.streak, pro ? friendsCleared(user, day) : null);
	}

	@Transactional
	public TodayQuestDto complete(UUID userId, UUID questId, Requests.CompleteQuest req) {
		User user = users.lock(userId);
		UserQuest quest = quests.findByIdAndUserId(questId, userId).filter(q -> q.active)
				.orElseThrow(() -> ApiException.notFound("Quest not found"));
		LocalDate today = users.today(user);
		LocalDate day = ProgressService.checkDay(req.date(), today);
		if (!progress.counts(user, quest)) {
			throw ApiException.proRequired("This quest is a PRO feature");
		}
		if (!quest.scheduledOn(day)) {
			throw ApiException.conflict("Quest isn't scheduled on " + day);
		}
		Double value = req.value();
		checkValue(quest, value);
		String photoUrl = blank(req.photoUrl()) ? null : photoUrls.ownUpload(userId, req.photoUrl(), "photoUrl");
		if (WEIGH_IN.equals(quest.code) && value != null) {
			progress.recordWeight(user, day, value, photoUrl, req.mlText());
		}
		return apply(user, quest, day, today, slotFor(quest, day, req.slot()),
				new Input(photoUrl, value, req.reps(), req.mlLabels(), req.mlText(), req.exercise()));
	}

	private static void checkValue(UserQuest quest, Double value) {
		if (value == null) {
			return;
		}
		if (WEIGH_IN.equals(quest.code)) {
			MetricBounds.check(Metric.WEIGHT, value, "value");
		}
		if (quest.proof == ProofType.AUTO && quest.autoSource == AutoSource.SLEEP && value > MAX_SLEEP_MINUTES) {
			throw ApiException.validation("Sleep can't be more than " + MAX_SLEEP_MINUTES + " minutes");
		}
		if (quest.proof == ProofType.LOG && value > MAX_LOG_KG) {
			throw ApiException.validation("value can't be more than " + MAX_LOG_KG + " kg");
		}
		if (quest.proof == ProofType.REPS && value > Requests.MAX_REPS) {
			throw ApiException.validation("reps can't be more than " + Requests.MAX_REPS);
		}
	}

	private int slotFor(UserQuest quest, LocalDate day, Integer requested) {
		int slots = quest.slots();
		if (requested != null) {
			if (requested > slots) {
				throw ApiException.validation("This quest has " + slots + (slots == 1 ? " slot" : " slots") + " today");
			}
			return requested;
		}
		Map<Integer, QuestCompletion> taken = completions.findByUserQuestIdAndDay(quest.id, day).stream()
				.collect(Collectors.toMap(c -> c.slot, Function.identity(), (a, b) -> a));
		for (int slot = 1; slot <= slots; slot++) {
			QuestCompletion c = taken.get(slot);
			if (c == null || c.status == QuestStatus.TODO) {
				return slot;
			}
		}
		return slots;
	}

	@Transactional
	public WeighInDto weighIn(UUID userId, Requests.WeighIn req) {
		User user = users.lock(userId);
		LocalDate today = users.today(user);
		LocalDate day = ProgressService.checkDay(req.date(), today);
		String photoUrl = blank(req.photoUrl()) ? null : photoUrls.ownUpload(userId, req.photoUrl(), "photoUrl");
		WeighIn weighIn = progress.recordWeight(user, day, req.value(), photoUrl, req.mlText());
		quests.findFirstByUserIdAndCodeAndActiveTrue(user.id, WEIGH_IN).filter(q -> q.scheduledOn(day) && progress.counts(user, q))
				.ifPresent(q -> apply(user, q, day, today, 1, new Input(photoUrl, req.value(), null, null, req.mlText(), null)));
		return new WeighInDto(weighIn.id, weighIn.day, weighIn.value);
	}

	@Transactional
	public void deleteWeighIn(UUID userId, LocalDate day) {
		users.lock(userId);
		progress.deleteWeighIn(userId, day);
	}

	@Transactional
	public void markVerified(Proof proof) {
		completions.findById(proof.refId).ifPresent(completion -> {
			completion.status = QuestStatus.DONE;
			completion.summary = "Friends verified";
			User owner = users.lock(completion.userId);
			progress.recordDay(owner, completion.day, users.today(owner));
		});
	}

	@Transactional
	public void checkedByAi(Proof proof) {
		completions.findById(proof.refId)
				.filter(completion -> proof.id.equals(completion.proofId) && completion.status == QuestStatus.PENDING)
				.ifPresent(completion -> {
					User owner = users.lock(completion.userId);
					completion.status = QuestStatus.DONE;
					completion.summary = proof.aiChecked ? AI_AFTER_NO_VERIFY : PHOTO_AFTER_NO_VERIFY;
					progress.recordDay(owner, completion.day, users.today(owner));
				});
	}

	@Transactional
	public void reopen(Proof proof) {
		completions.findById(proof.refId)
				.filter(completion -> proof.id.equals(completion.proofId) && completion.status == QuestStatus.PENDING)
				.ifPresent(completion -> {
					User owner = users.lock(completion.userId);
					completion.status = QuestStatus.TODO;
					completion.proofId = null;
					completion.summary = null;
					progress.recordDay(owner, completion.day, users.today(owner));
				});
	}

	private TodayQuestDto apply(User user, UserQuest quest, LocalDate day, LocalDate today, int slot, Input in) {
		QuestCompletion completion = completions.findByUserQuestIdAndDayAndSlot(quest.id, day, slot).orElse(null);
		if (completion != null && completion.status != QuestStatus.TODO) {
			return toDto(quest, completion, completion.proofId == null ? null : proofs.findById(completion.proofId).orElse(null), slot);
		}
		boolean isNew = completion == null;
		if (isNew) {
			completion = new QuestCompletion();
			completion.id = UUID.randomUUID();
			completion.userQuestId = quest.id;
			completion.userId = user.id;
			completion.day = day;
			completion.slot = slot;
			completion.createdAt = clock.instant();
		}
		boolean reached = switch (quest.proof) {
			case PHOTO -> {
				if (blank(in.photoUrl()) && !(WEIGH_IN.equals(quest.code) && in.value() != null)) {
					throw ApiException.validation("photoUrl is required");
				}
				completion.value = in.value();
				yield true;
			}
			case REPS -> {
				Integer reps = in.reps() != null ? in.reps() : in.value() == null ? null : (int) Math.round(in.value());
				if (reps == null || reps < 0) {
					throw ApiException.validation("reps is required");
				}
				boolean enough = reps >= QuestService.repsNeeded(quest, in.exercise());
				completion.reps = enough ? reps : Math.max(reps, completion.reps == null ? 0 : completion.reps);
				yield enough;
			}
			case AUTO -> {
				if (in.value() == null || in.value() < 0) {
					throw ApiException.validation("value is required");
				}
				completion.value = Math.max(in.value(), completion.value == null ? 0 : completion.value);
				yield quest.target == null || completion.value >= quest.target;
			}
			case CHECKIN, NONE -> true;
			case LOG -> {
				completion.value = in.value();
				yield true;
			}
		};
		if (!reached) {
			completion.status = QuestStatus.TODO;
			completion = completions.save(completion);
			return toDto(quest, completion, null, slot);
		}
		boolean squad = quest.squadCheck && quest.proof == ProofType.PHOTO && !blank(in.photoUrl()) && users.isPro(user);
		boolean aiChecked = !blank(in.photoUrl()) && AiCheck.quest(quest.code, in.mlLabels(), in.mlText());
		Proof proof = null;
		if (squad || !blank(in.photoUrl())) {
			if (!blank(in.photoUrl())) {
				photoUrls.requireUnusedProofPhoto(in.photoUrl());
			}
			proof = new Proof();
			proof.id = UUID.randomUUID();
			proof.userId = user.id;
			proof.kind = ProofKind.QUEST;
			proof.refId = completion.id;
			proof.photoUrl = blank(in.photoUrl()) ? null : in.photoUrl();
			proof.value = completion.value != null ? completion.value : completion.reps == null ? null : completion.reps.doubleValue();
			proof.mlLabels = in.mlLabels() == null ? new ArrayList<>() : new ArrayList<>(in.mlLabels());
			proof.mlText = in.mlText();
			proof.aiChecked = aiChecked;
			proof.status = squad ? ProofStatus.PENDING : ProofStatus.VERIFIED;
			proof.requiredVerifications = squad ? GoalService.COMMUNITY_VERIFICATIONS : 0;
			proof.isPublic = squad && quest.checkAudience == CheckAudience.EVERYONE;
			proof.createdAt = clock.instant();
			proof = proofs.save(proof);
			completion.proofId = proof.id;
		}
		completion.status = squad ? QuestStatus.PENDING : QuestStatus.DONE;
		completion.summary = summary(quest, completion, in, aiChecked);
		completion = completions.save(completion);
		if (squad) {
			FeedItem item = new FeedItem();
			item.id = UUID.randomUUID();
			item.userId = user.id;
			item.type = FeedType.QUEST_PROOF;
			item.proofId = proof.id;
			item.photoUrl = proof.photoUrl;
			item.title = quest.slots() > 1 ? quest.name + " · Meal " + slot : quest.name;
			item.subtitle = completion.summary;
			item.value = quest.weightValued() ? completion.value : null;
			item.unit = item.value == null ? null : "kg";
			item.isPublic = proof.isPublic;
			item.createdAt = clock.instant();
			item = feed.save(item);
			imageCheck.screen(item);
			verifyRequests.send(user, proof, item, quest.name + " proof is waiting for your friends");
		}
		progress.recordDay(user, day, today);
		return toDto(quest, completion, proof, slot);
	}

	private static String key(UUID questId, int slot) {
		return questId + ":" + slot;
	}

	private TodayQuestDto toDto(UserQuest quest, QuestCompletion completion, Proof proof, int slot) {
		QuestStatus status = completion == null ? QuestStatus.TODO : completion.status;
		Double progressValue = null;
		if (completion != null && quest.proof == ProofType.AUTO) {
			progressValue = completion.value;
		}
		if (completion != null && quest.proof == ProofType.REPS && completion.reps != null) {
			progressValue = completion.reps.doubleValue();
		}
		Integer target = quest.proof == ProofType.REPS ? Integer.valueOf(QuestService.repsNeeded(quest, Exercise.SQUAT)) : quest.target;
		int required = proof == null ? 0 : proof.requiredVerifications;
		int verified = proof == null ? 0 : proof.verifiedCount;
		String summary = completion == null ? null : completion.summary;
		if (status == QuestStatus.PENDING && proof != null) {
			summary = "Friends check · " + verified + "/" + required;
		}
		return new TodayQuestDto(QuestService.toDto(quest), status, progressValue, target, completion == null ? null : completion.id,
				proof == null ? null : proof.id, verified, required, summary,
				completion != null && quest.weightValued() ? completion.value : null, slot, quest.slots());
	}

	private FriendsCleared friendsCleared(User user, LocalDate day) {
		Set<UUID> friendIds = social.friendIds(user.id);
		friendIds.removeAll(userRepository.findSuspendedIds());
		if (friendIds.isEmpty()) {
			return new FriendsCleared(0, 0, List.of());
		}
		List<UUID> cleared = dailyResults.findByUserIdInAndDay(friendIds, day).stream().filter(DailyResult::complete)
				.map(r -> r.userId).toList();
		List<String> avatars = cleared.isEmpty() ? List.of()
				: userRepository.findByIdIn(cleared).stream().map(u -> u.avatarUrl).filter(Objects::nonNull)
						.limit(MAX_FRIEND_AVATARS).toList();
		return new FriendsCleared(cleared.size(), friendIds.size(), avatars);
	}

	private static String summary(UserQuest quest, QuestCompletion completion, Input in, boolean aiChecked) {
		if (WEIGH_IN.equals(quest.code) && completion.value != null) {
			return aiChecked ? AI_VERIFIED : blank(in.photoUrl()) ? null : PHOTO_PROOF;
		}
		return switch (quest.proof) {
			case PHOTO -> aiChecked ? AI_VERIFIED : PHOTO_PROOF;
			case REPS -> completion.reps + " reps";
			case AUTO -> quest.autoSource == AutoSource.SLEEP ? sleep(completion.value) : steps(completion.value);
			case CHECKIN -> "Checked in";
			case NONE -> "Done";
			case LOG -> completion.value == null ? "Logged" : null;
		};
	}


	private static String steps(Double value) {
		return String.format(Locale.US, "%,d steps", Math.round(value == null ? 0 : value));
	}

	private static String sleep(Double minutes) {
		long total = Math.round(minutes == null ? 0 : minutes);
		return (total / 60) + " h " + (total % 60) + " min sleep";
	}

	private static boolean blank(String value) {
		return value == null || value.isBlank();
	}

	private record Input(String photoUrl, Double value, Integer reps, List<String> mlLabels, String mlText, Exercise exercise) {
	}
}
