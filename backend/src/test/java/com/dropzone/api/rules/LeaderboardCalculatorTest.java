package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import com.dropzone.api.rules.LeaderboardCalculator.Point;
import com.dropzone.api.rules.LeaderboardCalculator.Ranked;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LeaderboardCalculatorTest {

	private static final LocalDate START = LocalDate.of(2026, 10, 19);
	private static final LocalDate END = LocalDate.of(2026, 10, 25);

	@Test
	void loseDeltaUsesLastValueBeforePeriodAsBaseline() {
		List<Point> points = List.of(new Point(START.minusDays(3), 90.0), new Point(START.minusDays(1), 89.4),
				new Point(START.plusDays(2), 88.9), new Point(END, 88.1));
		assertThat(LeaderboardCalculator.delta(Path.LOSE, points, START, END)).isEqualTo(1.3);
	}

	@Test
	void gainDeltaFallsBackToFirstValueInPeriod() {
		List<Point> points = List.of(new Point(START.plusDays(1), 100.0), new Point(END, 107.5));
		assertThat(LeaderboardCalculator.delta(Path.GAIN, points, START, END)).isEqualTo(7.5);
	}

	@Test
	void noMeasurementInThePeriodMeansNoDelta() {
		List<Point> points = List.of(new Point(START.minusDays(1), 80.0), new Point(END.plusDays(1), 70.0));
		assertThat(LeaderboardCalculator.delta(Path.LOSE, points, START, END)).isNull();
		assertThat(LeaderboardCalculator.delta(Path.LOSE, List.of(), START, END)).isNull();
	}

	@Test
	void gainsOnALossBoardKeepTheirSign() {
		List<Point> points = List.of(new Point(START.minusDays(2), 80.0), new Point(END, 82.0));
		assertThat(LeaderboardCalculator.delta(Path.LOSE, points, START, END)).isEqualTo(-2.0);
	}

	@Test
	void ranksByDeltaThenNameAndSharesRanksOnTies() {
		UUID a = UUID.randomUUID();
		UUID b = UUID.randomUUID();
		UUID c = UUID.randomUUID();
		UUID d = UUID.randomUUID();
		UUID idle = UUID.randomUUID();
		Map<UUID, List<Point>> points = new LinkedHashMap<>();
		points.put(a, List.of(new Point(START, 90.0), new Point(END, 89.0)));
		points.put(b, List.of(new Point(START, 100.0), new Point(END, 97.0)));
		points.put(c, List.of(new Point(START, 70.0), new Point(END, 69.0)));
		points.put(d, List.of(new Point(START, 60.0), new Point(END, 60.5)));
		points.put(idle, List.of(new Point(START.minusDays(5), 80.0)));
		Map<UUID, String> names = Map.of(a, "Zed", b, "Bea", c, "Al", d, "Dee", idle, "Idle");

		List<Ranked> ranked = LeaderboardCalculator.rank(Path.LOSE, Metric.WEIGHT, points, names, START, END);
		assertThat(ranked).extracting(Ranked::userId).containsExactly(b, c, a, d);
		assertThat(ranked).extracting(Ranked::rank).containsExactly(1, 2, 2, 4);
		assertThat(ranked).extracting(Ranked::delta).containsExactly(3.0, 1.0, 1.0, -0.5);
	}

	@Test
	void gainBoardsRankByPercentChangeAndKeepTheDelta() {
		UUID arm = UUID.randomUUID();
		UUID bench = UUID.randomUUID();
		UUID same = UUID.randomUUID();
		Map<UUID, List<Point>> points = new LinkedHashMap<>();
		points.put(arm, List.of(new Point(START, 30.0), new Point(END, 33.0)));
		points.put(bench, List.of(new Point(START, 100.0), new Point(END, 108.0)));
		points.put(same, List.of(new Point(START, 50.0), new Point(END, 55.0)));
		Map<UUID, String> names = Map.of(arm, "Arm", bench, "Bench", same, "Same");

		List<Ranked> ranked = LeaderboardCalculator.rank(Path.GAIN, Metric.SIZE, points, names, START, END);
		assertThat(ranked).extracting(Ranked::userId).containsExactly(arm, same, bench);
		assertThat(ranked).extracting(Ranked::rank).containsExactly(1, 1, 3);
		assertThat(ranked).extracting(Ranked::percent).containsExactly(10.0, 10.0, 8.0);
		assertThat(ranked).extracting(Ranked::delta).containsExactly(3.0, 5.0, 8.0);
		assertThat(LeaderboardCalculator.change(Path.LOSE, List.of(new Point(START, 80.0), new Point(END, 78.0)), START, END))
				.isEqualTo(new LeaderboardCalculator.Change(2.0, 2.5));
	}

	@Test
	void implausibleJumpsAreIgnored() {
		List<Point> typo = List.of(new Point(START.minusDays(3), 90.0), new Point(START.plusDays(1), 89.5), new Point(START.plusDays(2), 40.0));
		assertThat(LeaderboardCalculator.delta(Path.LOSE, LeaderboardCalculator.plausible(Metric.WEIGHT, typo), START, END)).isEqualTo(0.5);

		List<Point> steady = List.of(new Point(START.minusDays(30), 100.0), new Point(START, 90.0));
		assertThat(LeaderboardCalculator.plausible(Metric.WEIGHT, steady)).hasSize(2);
		List<Point> tooFast = List.of(new Point(START, 100.0), new Point(START.plusDays(6), 96.5));
		assertThat(LeaderboardCalculator.plausible(Metric.WEIGHT, tooFast)).hasSize(1);

		List<Point> lift = List.of(new Point(START, 100.0), new Point(START.plusDays(1), 125.0), new Point(START.plusDays(2), 170.0));
		assertThat(LeaderboardCalculator.plausible(Metric.STRENGTH, lift)).extracting(Point::value).containsExactly(100.0, 125.0);
	}
}
