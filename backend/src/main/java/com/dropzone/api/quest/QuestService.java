package com.dropzone.api.quest;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.QuestTypeDto;
import com.dropzone.api.common.Dtos.UserQuestDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.AutoSource;
import com.dropzone.api.domain.CheckAudience;
import com.dropzone.api.domain.Exercise;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.ProofType;
import com.dropzone.api.domain.QuestType;
import com.dropzone.api.domain.QuestTypeRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.goal.GoalService;
import com.dropzone.api.progress.ProgressService;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuestService {

	public static final int DEFAULT_REPS = 20;
	public static final int MIN_REPS = 5;
	public static final int MAX_REP_TARGET = 200;
	public static final int MAX_PER_DAY = 20;
	private static final int MIN_STEPS = 1000;
	private static final int MAX_STEPS = 50000;
	private static final int MIN_SLEEP_MINUTES = 240;
	private static final int MAX_SLEEP_MINUTES = 720;
	private static final int MAX_FREE_QUESTS = 3;
	private static final int MAX_CUSTOM_QUESTS = 20;
	private static final int CUSTOM_SORT_BASE = 100;
	private static final String FRIENDS_CHECK_PHOTO_ONLY = "Friends check works only for photo quests";
	public static final int MIN_CHECK_FRIENDS = GoalService.COMMUNITY_VERIFICATIONS;
	static final String TOO_FEW_FRIENDS = "You need at least " + MIN_CHECK_FRIENDS + " friends for Friends check, or choose Everyone";

	private final QuestTypeRepository types;
	private final UserQuestRepository quests;
	private final UserService users;
	private final ProgressService progress;
	private final SocialService social;
	private final Clock clock;

	public QuestService(QuestTypeRepository types, UserQuestRepository quests, UserService users, ProgressService progress,
			SocialService social, Clock clock) {
		this.types = types;
		this.quests = quests;
		this.users = users;
		this.progress = progress;
		this.social = social;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<QuestTypeDto> catalog() {
		return types.findAllByOrderByPathAscSortAsc().stream()
				.map(t -> new QuestTypeDto(t.code, t.path, t.name, t.icon, t.group, t.proof, t.free, t.autoSource, t.target, t.multiSlot,
						List.copyOf(t.defaultDays), t.defaultPerDay))
				.toList();
	}

	@Transactional(readOnly = true)
	public List<UserQuestDto> list(UUID userId) {
		return quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(userId).stream().map(QuestService::toDto).toList();
	}

	@Transactional
	public List<UserQuestDto> replace(UUID userId, List<String> codes, List<Requests.QuestSettings> settings) {
		User user = users.get(userId);
		if (user.path == null) {
			throw ApiException.conflict("Finish onboarding first");
		}
		boolean hasCustom = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(userId).stream().anyMatch(q -> q.custom);
		if (codes.isEmpty() && !hasCustom) {
			throw ApiException.validation("Pick at least one quest");
		}
		validateCodes(user, user.path, codes);
		applyCatalogQuests(user, user.path, codes, settings);
		recordToday(user);
		return list(userId);
	}

	public void validateCodes(User user, Path path, List<String> codes) {
		List<String> distinct = normalize(codes);
		Map<String, QuestType> catalog = catalogFor(path);
		for (String code : distinct) {
			if (!catalog.containsKey(code)) {
				throw ApiException.validation("Unknown quest " + code + " for " + path);
			}
		}
		if (!users.isPro(user)) {
			if (distinct.stream().anyMatch(c -> !catalog.get(c).free)) {
				throw ApiException.proRequired("This quest is a PRO feature");
			}
			if (distinct.size() > MAX_FREE_QUESTS) {
				throw ApiException.proRequired("Free plan allows " + MAX_FREE_QUESTS + " quests");
			}
		}
	}

	@Transactional
	public void applyCatalogQuests(User user, Path path, List<String> codes, List<Requests.QuestSettings> settings) {
		Map<String, Requests.QuestSettings> byCode = settings == null ? Map.of()
				: settings.stream().filter(x -> x != null && x.code() != null)
						.collect(Collectors.toMap(x -> x.code().trim().toUpperCase(), Function.identity(), (a, b) -> b));
		List<String> wanted = normalize(codes);
		Map<String, QuestType> catalog = catalogFor(path);
		List<UserQuest> current = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(user.id);
		Map<String, UserQuest> existing = current.stream().filter(q -> !q.custom && q.code != null)
				.collect(Collectors.toMap(q -> q.code, Function.identity(), (a, b) -> a));
		for (UserQuest quest : current) {
			if (!quest.custom && !(wanted.contains(quest.code) && catalog.containsKey(quest.code) && sameType(quest, catalog))) {
				quest.active = false;
			}
		}
		quests.flush();
		for (int i = 0; i < wanted.size(); i++) {
			String code = wanted.get(i);
			UserQuest quest = existing.get(code);
			if (quest == null || !quest.active) {
				quest = create(user, catalog.get(code), i, false, null);
			}
			quest.sort = i;
			quest.autoFree = false;
			quest.startsOn = null;
			Requests.QuestSettings setting = byCode.get(code);
			if (setting != null) {
				schedule(quest, setting.days(), setting.perDay(), setting.target());
			}
		}
	}

	@Transactional
	public void ensureFreeQuests(User user) {
		if (user.path == null || users.isPro(user)) {
			return;
		}
		List<UserQuest> active = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(user.id);
		List<QuestType> free = types.findByPathOrderBySortAsc(user.path).stream().filter(t -> t.free).toList();
		Set<String> activeCodes = active.stream().filter(q -> !q.custom && q.code != null).map(q -> q.code).collect(Collectors.toSet());
		if (free.stream().anyMatch(t -> activeCodes.contains(t.code))) {
			return;
		}
		users.lock(user.id);
		active = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(user.id);
		if (active.stream().anyMatch(q -> !q.custom && q.code != null && free.stream().anyMatch(t -> t.code.equals(q.code)))) {
			return;
		}
		LocalDate today = users.today(user);
		LocalDate startsOn = progress.clearedBeforeProEnded(user, today) ? today.plusDays(1) : null;
		int sort = active.size();
		for (QuestType type : free) {
			create(user, type, sort++, true, startsOn);
		}
	}

	@Transactional
	public void dropAutoFreeQuests(User user) {
		if (quests.deactivateAutoFree(user.id) > 0) {
			recordToday(user);
		}
	}

	private UserQuest create(User user, QuestType type, int sort, boolean autoFree, LocalDate startsOn) {
		UserQuest created = new UserQuest();
		created.id = UUID.randomUUID();
		created.userId = user.id;
		created.questTypeId = type.id;
		created.code = type.code;
		created.name = type.name;
		created.icon = type.icon;
		created.group = type.group;
		created.proof = type.proof;
		created.autoSource = type.autoSource;
		created.target = type.target;
		created.multiSlot = type.multiSlot;
		created.days = new ArrayList<>(type.defaultDays);
		created.perDay = type.defaultPerDay;
		created.sort = sort;
		created.autoFree = autoFree;
		created.startsOn = startsOn;
		created.createdAt = clock.instant();
		return quests.save(created);
	}

	@Transactional
	public UserQuestDto createCustom(UUID userId, Requests.CustomQuest req) {
		User user = users.get(userId);
		users.requirePro(user, "Custom quests");
		if (req.proof() == ProofType.AUTO) {
			throw ApiException.validation("Custom quests can't use AUTO proof");
		}
		if (req.squadCheck() && req.proof() != ProofType.PHOTO) {
			throw ApiException.validation(FRIENDS_CHECK_PHOTO_ONLY);
		}
		List<UserQuest> active = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(userId);
		long customCount = active.stream().filter(q -> q.custom).count();
		if (customCount >= MAX_CUSTOM_QUESTS) {
			throw ApiException.conflict("Too many custom quests");
		}
		UserQuest quest = new UserQuest();
		quest.id = UUID.randomUUID();
		quest.userId = userId;
		quest.name = req.name().trim();
		quest.icon = req.icon().trim();
		quest.group = req.group();
		quest.proof = req.proof();
		quest.target = req.proof() == ProofType.REPS ? DEFAULT_REPS : null;
		quest.custom = true;
		quest.days = new ArrayList<>(new LinkedHashSet<>(req.days().stream().sorted().toList()));
		quest.squadCheck = req.squadCheck();
		quest.checkAudience = req.checkAudience() == null ? CheckAudience.FRIENDS : req.checkAudience();
		if (quest.squadCheck) {
			requireCheckers(userId, quest.checkAudience);
		}
		quest.sort = CUSTOM_SORT_BASE + (int) customCount;
		quest.createdAt = clock.instant();
		UserQuest saved = quests.save(quest);
		recordToday(user);
		return toDto(saved);
	}

	@Transactional
	public UserQuestDto update(UUID userId, UUID questId, Requests.UpdateQuest req) {
		UserQuest quest = quests.findByIdAndUserId(questId, userId).filter(q -> q.active)
				.orElseThrow(() -> ApiException.notFound("Quest not found"));
		User user = users.get(userId);
		quest.autoFree = false;
		boolean squad = req.squadCheck() != null ? req.squadCheck() : quest.squadCheck;
		CheckAudience audience = req.checkAudience() != null ? req.checkAudience() : quest.checkAudience;
		if (req.squadCheck() != null) {
			if (req.squadCheck() && quest.proof != ProofType.PHOTO) {
				throw ApiException.validation(FRIENDS_CHECK_PHOTO_ONLY);
			}
			if (req.squadCheck() && !quest.squadCheck) {
				users.requirePro(user, "Friends check");
			}
		}
		if (squad && (!quest.squadCheck || audience != quest.checkAudience)) {
			requireCheckers(userId, audience);
		}
		quest.squadCheck = squad;
		quest.checkAudience = audience;
		schedule(quest, req.days(), req.perDay(), req.target());
		recordToday(user);
		return toDto(quest);
	}

	private void requireCheckers(UUID userId, CheckAudience audience) {
		if (audience == CheckAudience.FRIENDS && social.friendCount(userId) < MIN_CHECK_FRIENDS) {
			throw ApiException.validation(TOO_FEW_FRIENDS);
		}
	}

	private static void schedule(UserQuest quest, List<Integer> days, Integer perDay, Integer target) {
		if (days != null) {
			List<Integer> clean = days.stream().filter(d -> d != null && d >= 1 && d <= 7).distinct().sorted().toList();
			if (clean.isEmpty()) {
				throw ApiException.validation("Pick at least one day");
			}
			quest.days = new ArrayList<>(clean);
		}
		if (perDay != null) {
			if (perDay < 1 || perDay > MAX_PER_DAY) {
				throw ApiException.validation("perDay must be between 1 and " + MAX_PER_DAY);
			}
			if (perDay > 1 && !quest.multiSlot) {
				throw ApiException.validation(quest.name + " can't repeat during the day");
			}
			quest.perDay = perDay;
		}
		if (target != null) {
			if (quest.proof == ProofType.REPS) {
				setRepTarget(quest, target);
			}
			else {
				setAutoTarget(quest, target);
			}
		}
	}

	private static void setRepTarget(UserQuest quest, int target) {
		if (target < MIN_REPS || target > MAX_REP_TARGET) {
			throw ApiException.validation("Rep goal must be between " + MIN_REPS + " and " + MAX_REP_TARGET + " squats");
		}
		quest.target = target;
	}

	public static int repsNeeded(UserQuest quest, Exercise exercise) {
		int target = quest.target == null ? DEFAULT_REPS : quest.target;
		return exercise == Exercise.PUSHUP ? (target + 1) / 2 : target;
	}

	private static void setAutoTarget(UserQuest quest, int target) {
		if (quest.proof != ProofType.AUTO || quest.autoSource == null) {
			throw ApiException.validation("Only auto and rep quests have a daily goal");
		}
		boolean sleep = quest.autoSource == AutoSource.SLEEP;
		int min = sleep ? MIN_SLEEP_MINUTES : MIN_STEPS;
		int max = sleep ? MAX_SLEEP_MINUTES : MAX_STEPS;
		if (target < min || target > max) {
			throw ApiException.validation(sleep ? "Sleep goal must be between 4 and 12 hours" : "Step goal must be between 1,000 and 50,000 steps");
		}
		quest.target = target;
		if (sleep && "SLEEP".equals(quest.code)) {
			quest.name = "Sleep " + hours(target) + " h";
		}
	}

	private static String hours(int minutes) {
		double h = minutes / 60.0;
		return h == Math.rint(h) ? String.valueOf((int) h) : String.format(Locale.US, "%.1f", h);
	}

	@Transactional
	public void delete(UUID userId, UUID questId) {
		UserQuest quest = quests.findByIdAndUserId(questId, userId).filter(q -> q.active)
				.orElseThrow(() -> ApiException.notFound("Quest not found"));
		quest.active = false;
		recordToday(users.get(userId));
	}

	private void recordToday(User user) {
		LocalDate today = users.today(user);
		progress.recordDay(user, today, today);
	}

	public static UserQuestDto toDto(UserQuest q) {
		return new UserQuestDto(q.id, q.code, q.name, q.icon, q.group, q.proof, q.autoSource, q.target, q.custom,
				List.copyOf(q.days), q.squadCheck, q.slots(), q.multiSlot, q.checkAudience);
	}

	private Map<String, QuestType> catalogFor(Path path) {
		return types.findByPathOrderBySortAsc(path).stream().collect(Collectors.toMap(t -> t.code, Function.identity()));
	}

	private static boolean sameType(UserQuest quest, Map<String, QuestType> catalog) {
		QuestType type = catalog.get(quest.code);
		return quest.questTypeId == null || quest.questTypeId.equals(type.id);
	}

	private static List<String> normalize(List<String> codes) {
		return codes == null ? List.of()
				: codes.stream().filter(c -> c != null && !c.isBlank()).map(c -> c.trim().toUpperCase()).distinct().toList();
	}
}
