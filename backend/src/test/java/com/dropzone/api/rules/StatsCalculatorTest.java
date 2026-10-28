package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StatsCalculatorTest {

	@Test
	void levelIsZeroWithoutProgress() {
		assertThat(StatsCalculator.level(0, 4)).isZero();
		assertThat(StatsCalculator.level(0, 0)).isZero();
	}

	@Test
	void levelScalesInQuarters() {
		assertThat(StatsCalculator.level(1, 4)).isEqualTo(1);
		assertThat(StatsCalculator.level(2, 4)).isEqualTo(2);
		assertThat(StatsCalculator.level(3, 4)).isEqualTo(3);
		assertThat(StatsCalculator.level(4, 4)).isEqualTo(4);
		assertThat(StatsCalculator.level(1, 3)).isEqualTo(2);
		assertThat(StatsCalculator.level(1, 10)).isEqualTo(1);
		assertThat(StatsCalculator.level(5, 4)).isEqualTo(4);
	}

	@Test
	void changePctComparesToPreviousMonth() {
		assertThat(StatsCalculator.changePct(6, 8)).isEqualTo(-25);
		assertThat(StatsCalculator.changePct(9, 6)).isEqualTo(50);
		assertThat(StatsCalculator.changePct(3, 0)).isNull();
	}
}
