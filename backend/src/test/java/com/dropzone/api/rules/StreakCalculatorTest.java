package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Set;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

class StreakCalculatorTest {

	private static final LocalDate TODAY = LocalDate.of(2026, 10, 25);

	@Test
	void countsBackFromTodayWhenTodayIsComplete() {
		Set<LocalDate> days = Set.of(TODAY, TODAY.minusDays(1), TODAY.minusDays(2));
		assertThat(StreakCalculator.current(days, TODAY)).isEqualTo(3);
	}

	@Test
	void keepsYesterdaysStreakWhileTodayIsStillOpen() {
		Set<LocalDate> days = Set.of(TODAY.minusDays(1), TODAY.minusDays(2));
		assertThat(StreakCalculator.current(days, TODAY)).isEqualTo(2);
	}

	@Test
	void gapResetsStreak() {
		Set<LocalDate> days = Set.of(TODAY.minusDays(2), TODAY.minusDays(3));
		assertThat(StreakCalculator.current(days, TODAY)).isZero();
		assertThat(StreakCalculator.current(Set.of(), TODAY)).isZero();
	}

	@Test
	void restDaysAreSkippedWhenTheSettingIsOn() {
		LocalDate monday = LocalDate.of(2026, 10, 19);
		LocalDate nextMonday = monday.plusDays(7);
		Set<LocalDate> days = Set.of(monday, monday.plusDays(1), monday.plusDays(2), monday.plusDays(3), monday.plusDays(4), nextMonday);
		Predicate<LocalDate> weekend = day -> day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY;
		assertThat(StreakCalculator.current(days, weekend, nextMonday)).isEqualTo(6);
		assertThat(StreakCalculator.current(days, nextMonday)).isEqualTo(1);
		assertThat(StreakCalculator.current(days, weekend, nextMonday.plusDays(1))).isEqualTo(6);
		assertThat(StreakCalculator.best(days, weekend)).isEqualTo(6);
		assertThat(StreakCalculator.best(days)).isEqualTo(5);
	}

	@Test
	void aMissedScheduledDayStillBreaksTheStreakWithRestDaysSkipped() {
		LocalDate monday = LocalDate.of(2026, 10, 19);
		Set<LocalDate> days = Set.of(monday, monday.plusDays(2));
		Predicate<LocalDate> sunday = day -> day.getDayOfWeek() == DayOfWeek.SUNDAY;
		assertThat(StreakCalculator.current(days, sunday, monday.plusDays(2))).isEqualTo(1);
		assertThat(StreakCalculator.best(days, sunday)).isEqualTo(1);
		assertThat(StreakCalculator.current(Set.of(), day -> true, monday)).isZero();
		assertThat(StreakCalculator.current(Set.of(monday), day -> true, monday.plusDays(30))).isEqualTo(1);
	}

	@Test
	void bestFindsLongestRun() {
		Set<LocalDate> days = Set.of(TODAY, TODAY.minusDays(5), TODAY.minusDays(6), TODAY.minusDays(7), TODAY.minusDays(10));
		assertThat(StreakCalculator.best(days)).isEqualTo(3);
		assertThat(StreakCalculator.best(Set.of())).isZero();
	}
}
