package com.dropzone.api.progress;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.HistoryPoint;
import com.dropzone.api.common.Dtos.MeasurementDto;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.Measurement;
import com.dropzone.api.domain.MeasurementRepository;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.QuestTypeRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.domain.WeighIn;
import com.dropzone.api.domain.WeighInRepository;
import com.dropzone.api.rules.StreakCalculator;
import com.dropzone.api.storage.UploadCleanup;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.BinaryOperator;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProgressService {

	public static final String WEIGH_IN = "WEIGH_IN";
	static final int MAX_MEASUREMENTS = 60;

	private final UserQuestRepository quests;
	private final QuestCompletionRepository completions;
	private final DailyResultRepository dailyResults;
	private final WeighInRepository weighIns;
	private final MeasurementRepository measurements;
	private final GoalRepository goals;
	private final QuestTypeRepository questTypes;
	private final UserRepository userRepository;
	private final UploadCleanup uploads;
	private final Clock clock;

	public ProgressService(UserQuestRepository quests, QuestCompletionRepository completions, DailyResultRepository dailyResults,
			WeighInRepository weighIns, MeasurementRepository measurements, GoalRepository goals, QuestTypeRepository questTypes,
			UserRepository userRepository, UploadCleanup uploads, Clock clock) {
		this.quests = quests;
		this.completions = completions;
		this.dailyResults = dailyResults;
		this.weighIns = weighIns;
		this.measurements = measurements;
		this.goals = goals;
		this.questTypes = questTypes;
		this.userRepository = userRepository;
		this.uploads = uploads;
		this.clock = clock;
	}

	public static LocalDate checkDay(LocalDate requested, LocalDate today) {
		LocalDate day = requested == null ? today : requested;
		if (day.isBefore(today.minusDays(1)) || day.isAfter(today.plusDays(1))) {
			throw ApiException.validation("Date must be yesterday, today or tomorrow");
		}
		return day;
	}

	@Transactional(readOnly = true)
	public List<UserQuest> scheduled(User user, LocalDate day) {
		return effective(user).stream().filter(q -> q.scheduledOn(day)).toList();
	}

	@Transactional(readOnly = true)
	public List<UserQuest> effective(User user) {
		List<UserQuest> active = quests.findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(user.id);
		if (user.isProActive(clock.instant())) {
			return active;
		}
		Set<String> free = freeCodes(user);
		return active.stream().filter(q -> isFree(q, free)).toList();
	}

	public int slotsScheduled(User user, LocalDate day) {
		return scheduled(user, day).stream().mapToInt(UserQuest::slots).sum();
	}

	private static int slotCount(Collection<Integer> slots) {
		return slots.stream().mapToInt(Integer::intValue).sum();
	}

	public boolean counts(User user, UserQuest quest) {
		return user.isProActive(clock.instant()) || isFree(quest, freeCodes(user));
	}

	private static boolean isFree(UserQuest quest, Set<String> freeCodes) {
		return !quest.custom && quest.code != null && freeCodes.contains(quest.code);
	}

	private Set<String> freeCodes(User user) {
		if (user.path == null) {
			return Set.of();
		}
		return questTypes.findByPathOrderBySortAsc(user.path).stream().filter(t -> t.free).map(t -> t.code).collect(Collectors.toSet());
	}

	@Transactional
	public DailyResult recordDay(User user, LocalDate day, LocalDate today) {
		Map<UUID, Integer> slotsById = scheduled(user, day).stream().collect(Collectors.toMap(q -> q.id, UserQuest::slots, (a, b) -> a));
		int done = (int) completions.findByUserIdAndDay(user.id, day).stream()
				.filter(c -> c.status == QuestStatus.DONE && c.slot <= slotsById.getOrDefault(c.userQuestId, 0))
				.count();
		DailyResult result = dailyResults.findById(new DailyResult.Key(user.id, day)).orElseGet(() -> {
			DailyResult r = new DailyResult();
			r.userId = user.id;
			r.day = day;
			return r;
		});
		int total = slotCount(slotsById.values());
		boolean complete = total > 0 && done >= total;
		Instant now = clock.instant();
		boolean pro = user.isProActive(now);
		if (!complete && !pro && result.proClearedAt != null && result.complete()) {
			refreshStreak(user, today);
			return result;
		}
		result.doneCount = done;
		result.totalCount = total;
		if (!complete) {
			result.proClearedAt = null;
		}
		else if (pro && result.proClearedAt == null) {
			result.proClearedAt = now;
		}
		dailyResults.save(result);
		refreshStreak(user, today);
		return result;
	}

	@Transactional(readOnly = true)
	public boolean clearedBeforeProEnded(User user, LocalDate day) {
		return !user.isProActive(clock.instant()) && dailyResults.findById(new DailyResult.Key(user.id, day))
				.filter(r -> r.proClearedAt != null && r.complete()).isPresent();
	}

	@Transactional
	public void refreshStreak(User user, LocalDate today) {
		Set<LocalDate> days = new HashSet<>(dailyResults.completeDays(user.id));
		Predicate<LocalDate> rest = restDays(user);
		int streak = StreakCalculator.current(days, rest, today);
		int best = Math.max(user.bestStreak, StreakCalculator.best(days, rest));
		if (streak != user.streak || best != user.bestStreak) {
			userRepository.updateStreak(user.id, streak, best);
			user.streak = streak;
			user.bestStreak = best;
		}
	}

	@Transactional(readOnly = true)
	public Predicate<LocalDate> restDays(User user) {
		if (!user.skipRestDays) {
			return day -> false;
		}
		Map<LocalDate, Integer> totals = dailyResults.findByUserIdOrderByDayAsc(user.id).stream()
				.collect(Collectors.toMap(r -> r.day, r -> r.totalCount, (a, b) -> a));
		List<UserQuest> schedule = effective(user);
		return day -> {
			Integer total = totals.get(day);
			return total != null ? total == 0 : schedule.stream().noneMatch(q -> q.scheduledOn(day));
		};
	}

	@Transactional
	public WeighIn recordWeight(User user, LocalDate day, double value, String photoUrl, String mlText) {
		WeighIn weighIn = weighIns.findByUserIdAndDay(user.id, day).orElseGet(() -> {
			WeighIn w = new WeighIn();
			w.id = UUID.randomUUID();
			w.userId = user.id;
			w.day = day;
			return w;
		});
		weighIn.value = value;
		if (photoUrl != null) {
			weighIn.photoUrl = photoUrl;
		}
		if (mlText != null) {
			weighIn.mlText = mlText;
		}
		weighIn.createdAt = clock.instant();
		weighIns.save(weighIn);
		recordMeasurement(user.id, Metric.WEIGHT, day, value);
		return weighIn;
	}

	@Transactional(readOnly = true)
	public boolean hasWeighIn(User user, LocalDate day) {
		return weighIns.existsByUserIdAndDay(user.id, day);
	}

	@Transactional(readOnly = true)
	public List<HistoryPoint> history(Goal goal, LocalDate from, LocalDate to) {
		if (goal.metric == Metric.WEIGHT) {
			return weighIns.findByUserIdAndDayBetweenOrderByDayAsc(goal.userId, from, to).stream()
					.map(w -> new HistoryPoint(w.day, w.value)).toList();
		}
		BinaryOperator<Double> best = goal.path == Path.LOSE ? Math::min : Math::max;
		return measurements.findByUserIdAndMetricAndDayBetween(goal.userId, goal.metric, from, to).stream()
				.collect(Collectors.toMap(m -> m.day, m -> m.value, best, TreeMap::new))
				.entrySet().stream().map(e -> new HistoryPoint(e.getKey(), e.getValue())).toList();
	}

	@Transactional
	public void recordMeasurement(UUID userId, Metric metric, LocalDate day, double value) {
		boolean newest = measurements.findFirstByUserIdAndMetricOrderByDayDescCreatedAtDesc(userId, metric)
				.map(latest -> !day.isBefore(latest.day))
				.orElse(true);
		if (metric == Metric.WEIGHT) {
			measurements.upsertWeight(UUID.randomUUID(), userId, day, value, clock.instant());
		}
		else {
			Measurement m = new Measurement();
			m.id = UUID.randomUUID();
			m.userId = userId;
			m.metric = metric;
			m.day = day;
			m.value = value;
			m.createdAt = clock.instant();
			measurements.save(m);
		}
		activeGoal(userId, metric).ifPresent(g -> {
			if (metric == Metric.STRENGTH) {
				g.currentValue = Math.max(g.currentValue, value);
			}
			else if (newest) {
				g.currentValue = value;
			}
		});
	}

	@Transactional(readOnly = true)
	public List<MeasurementDto> measurements(UUID userId, Metric metric) {
		return measurements.findByUserIdAndMetricOrderByDayDescCreatedAtDesc(userId, metric, PageRequest.of(0, MAX_MEASUREMENTS)).stream()
				.map(m -> new MeasurementDto(m.id, m.metric, m.day, m.value, m.createdAt))
				.toList();
	}

	@Transactional
	public void deleteWeighIn(UUID userId, LocalDate day) {
		WeighIn weighIn = weighIns.findByUserIdAndDay(userId, day).orElseThrow(() -> ApiException.notFound("Weigh-in not found"));
		removeWeight(userId, day, weighIn);
	}

	@Transactional
	public void deleteMeasurement(UUID userId, UUID id) {
		Measurement m = measurements.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Measurement not found"));
		if (m.metric == Metric.WEIGHT) {
			removeWeight(userId, m.day, weighIns.findByUserIdAndDay(userId, m.day).orElse(null));
			return;
		}
		measurements.delete(m);
		recomputeCurrent(userId, m.metric);
	}

	private void removeWeight(UUID userId, LocalDate day, WeighIn weighIn) {
		if (weighIn != null) {
			weighIns.delete(weighIn);
			if (weighIn.photoUrl != null) {
				uploads.deleteIfUnused(weighIn.photoUrl);
			}
		}
		measurements.deleteWeight(userId, day);
		Set<UUID> weighInQuests = quests.findByUserIdAndCode(userId, WEIGH_IN).stream().map(q -> q.id).collect(Collectors.toSet());
		completions.findByUserIdAndDay(userId, day).stream().filter(c -> weighInQuests.contains(c.userQuestId)).forEach(c -> c.value = null);
		recomputeCurrent(userId, Metric.WEIGHT);
	}

	private void recomputeCurrent(UUID userId, Metric metric) {
		activeGoal(userId, metric).ifPresent(g -> {
			Optional<Measurement> source = metric == Metric.STRENGTH
					? measurements.findFirstByUserIdAndMetricOrderByValueDesc(userId, metric)
					: measurements.findFirstByUserIdAndMetricOrderByDayDescCreatedAtDesc(userId, metric);
			g.currentValue = source.map(m -> m.value).orElse(g.startValue);
		});
	}

	private Optional<Goal> activeGoal(UUID userId, Metric metric) {
		return goals.findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(userId).filter(g -> g.metric == metric);
	}
}
