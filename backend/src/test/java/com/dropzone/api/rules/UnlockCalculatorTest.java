package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.domain.UnlockMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class UnlockCalculatorTest {

	private static final LocalDate DAY = LocalDate.of(2026, 10, 25);
	private static final ZoneId PRAGUE = ZoneId.of("Europe/Prague");

	@Test
	void wholeDayUnlocksUntilLocalMidnightWhenAllDone() {
		UnlockCalculator.UnlockState state = UnlockCalculator.compute(UnlockMode.WHOLE_DAY, 3, 3, 30, DAY, PRAGUE);
		assertThat(state.unlocked()).isTrue();
		assertThat(state.unlockedUntil()).isEqualTo(Instant.parse("2026-10-25T23:00:00Z"));
		assertThat(state.minutesEarned()).isZero();
	}

	@Test
	void anUnlockEndsWhenItsDayIsOver() {
		UnlockCalculator.UnlockState cleared = UnlockCalculator.compute(UnlockMode.WHOLE_DAY, 3, 3, 30, DAY, PRAGUE);
		assertThat(UnlockCalculator.activeAt(cleared, DAY, PRAGUE, Instant.parse("2026-10-25T22:59:00Z"))).isTrue();
		assertThat(UnlockCalculator.activeAt(cleared, DAY, PRAGUE, Instant.parse("2026-10-25T23:00:00Z"))).isFalse();
		UnlockCalculator.UnlockState minutes = UnlockCalculator.compute(UnlockMode.MINUTES, 1, 3, 30, DAY, PRAGUE);
		assertThat(UnlockCalculator.activeAt(minutes, DAY, PRAGUE, Instant.parse("2026-10-25T12:00:00Z"))).isTrue();
		assertThat(UnlockCalculator.activeAt(minutes, DAY, PRAGUE, Instant.parse("2026-10-26T12:00:00Z"))).isFalse();
	}

	@Test
	void wholeDayStaysLockedUntilEverythingIsDone() {
		UnlockCalculator.UnlockState state = UnlockCalculator.compute(UnlockMode.WHOLE_DAY, 2, 3, 30, DAY, PRAGUE);
		assertThat(state.unlocked()).isFalse();
		assertThat(state.unlockedUntil()).isNull();
	}

	@Test
	void minutesModeEarnsMinutesPerDoneQuest() {
		UnlockCalculator.UnlockState state = UnlockCalculator.compute(UnlockMode.MINUTES, 2, 4, 30, DAY, PRAGUE);
		assertThat(state.unlocked()).isTrue();
		assertThat(state.minutesEarned()).isEqualTo(60);
		assertThat(state.unlockedUntil()).isNull();
	}

	@Test
	void minutesModeWithNothingDoneIsLocked() {
		UnlockCalculator.UnlockState state = UnlockCalculator.compute(UnlockMode.MINUTES, 0, 4, 45, DAY, PRAGUE);
		assertThat(state.unlocked()).isFalse();
		assertThat(state.minutesEarned()).isZero();
	}

	@Test
	void minutesModeAllDoneUnlocksWholeDay() {
		UnlockCalculator.UnlockState state = UnlockCalculator.compute(UnlockMode.MINUTES, 4, 4, 15, DAY, ZoneId.of("UTC"));
		assertThat(state.unlocked()).isTrue();
		assertThat(state.minutesEarned()).isEqualTo(60);
		assertThat(state.unlockedUntil()).isEqualTo(Instant.parse("2026-10-26T00:00:00Z"));
	}
}
