package com.dropzone.api.leaderboard;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.LeaderboardDto;
import com.dropzone.api.common.Dtos.LeaderboardEntryDto;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.Measurement;
import com.dropzone.api.domain.MeasurementRepository;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.Period;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.rules.LeaderboardCalculator;
import com.dropzone.api.rules.LeaderboardCalculator.Ranked;
import com.dropzone.api.social.SocialService;
import com.dropzone.api.user.UserService;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeaderboardService {

	private static final int TOP = 10;

	private final UserService users;
	private final UserRepository userRepository;
	private final GoalRepository goals;
	private final MeasurementRepository measurements;
	private final SocialService social;
	private final BlockService blocks;

	public LeaderboardService(UserService users, UserRepository userRepository, GoalRepository goals, MeasurementRepository measurements,
			SocialService social, BlockService blocks) {
		this.users = users;
		this.userRepository = userRepository;
		this.goals = goals;
		this.measurements = measurements;
		this.social = social;
		this.blocks = blocks;
	}

	public record Range(LocalDate start, LocalDate end) {
	}

	public static Range range(Period period, LocalDate today) {
		return switch (period) {
			case WEEK -> new Range(today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
					today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY)));
			case MONTH -> new Range(today.withDayOfMonth(1), today.with(TemporalAdjusters.lastDayOfMonth()));
			case HALF_YEAR -> today.getMonthValue() <= 6
					? new Range(LocalDate.of(today.getYear(), 1, 1), LocalDate.of(today.getYear(), 6, 30))
					: new Range(LocalDate.of(today.getYear(), 7, 1), LocalDate.of(today.getYear(), 12, 31));
		};
	}

	@Transactional(readOnly = true)
	public LeaderboardDto leaderboard(UUID userId, Period period) {
		User me = users.get(userId);
		users.requirePro(me, "Leaderboard");
		if (me.path == null) {
			throw ApiException.conflict("Finish onboarding first");
		}
		Optional<Goal> myGoal = goals.findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(userId);
		Metric metric = me.path == Path.LOSE ? Metric.WEIGHT : myGoal.map(g -> g.metric).orElse(Metric.WEIGHT);
		String unit = me.path == Path.LOSE ? "kg" : myGoal.map(g -> g.unit).orElse("kg");

		Set<UUID> candidates = new HashSet<>(social.friendIds(userId));
		candidates.removeAll(blocks.hiddenUsers(userId));
		candidates.add(userId);
		Map<UUID, Goal> goalByUser = new HashMap<>();
		for (Goal goal : goals.findByUserIdInAndActiveTrue(candidates)) {
			goalByUser.merge(goal.userId, goal, (a, b) -> a.createdAt.isAfter(b.createdAt) ? a : b);
		}
		Map<UUID, User> participants = userRepository.findByIdIn(candidates).stream()
				.filter(u -> u.id.equals(userId) || (u.path == me.path && users.isPro(u) && !u.hiddenFromLeaderboards))
				.filter(u -> u.id.equals(userId) || me.path == Path.LOSE
						|| (goalByUser.containsKey(u.id) && goalByUser.get(u.id).metric == metric))
				.collect(Collectors.toMap(u -> u.id, Function.identity()));

		Range range = range(period, users.today(me));
		Map<UUID, List<LeaderboardCalculator.Point>> points = new HashMap<>();
		participants.keySet().forEach(id -> points.put(id, new ArrayList<>()));
		for (Measurement m : measurements.findByUserIdInAndMetricAndDayLessThanEqualOrderByDayAscCreatedAtAsc(participants.keySet(),
				metric, range.end())) {
			points.get(m.userId).add(new LeaderboardCalculator.Point(m.day, m.value));
		}
		Map<UUID, String> names = participants.values().stream().collect(Collectors.toMap(u -> u.id, u -> u.displayName));
		List<Ranked> ranked = LeaderboardCalculator.rank(me.path, metric, points, names, range.start(), range.end());
		List<Ranked> shown;
		Ranked mine;
		if (me.hiddenFromLeaderboards) {
			Map<UUID, List<LeaderboardCalculator.Point>> others = new HashMap<>(points);
			others.remove(userId);
			shown = LeaderboardCalculator.rank(me.path, metric, others, names, range.start(), range.end()).stream().limit(TOP).toList();
			mine = ranked.stream().filter(r -> r.userId().equals(userId)).findFirst().orElse(null);
		}
		else {
			boolean othersQualify = ranked.stream().anyMatch(r -> !r.userId().equals(userId));
			shown = othersQualify ? ranked.stream().limit(TOP).toList() : ranked.stream().filter(r -> r.userId().equals(userId)).toList();
			mine = shown.stream().anyMatch(r -> r.userId().equals(userId)) ? null
					: ranked.stream().filter(r -> r.userId().equals(userId)).findFirst().orElse(null);
		}
		Function<Ranked, LeaderboardEntryDto> entry = r -> new LeaderboardEntryDto(r.rank(), UserService.summary(participants.get(r.userId())),
				r.delta(), unit, r.percent());
		return new LeaderboardDto(period, me.path, metric, unit, range.end().plusDays(1).atStartOfDay(users.zone(me)).toInstant(),
				shown.stream().map(entry).toList(), mine == null ? null : entry.apply(mine));
	}
}
