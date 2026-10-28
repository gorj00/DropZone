package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class CheckpointPlannerTest {

	@Test
	void spacesLoseTargetsEvenly() {
		assertThat(CheckpointPlanner.plan(90, 80, 4)).containsExactly(87.5, 85.0, 82.5, 80.0);
	}

	@Test
	void spacesGainTargetsEvenly() {
		assertThat(CheckpointPlanner.plan(70, 76, 3)).containsExactly(72.0, 74.0, 76.0);
	}

	@Test
	void roundsToOneDecimalAndEndsExactlyOnGoal() {
		assertThat(CheckpointPlanner.plan(90, 80, 3)).containsExactly(86.7, 83.3, 80.0);
		assertThat(CheckpointPlanner.plan(101.3, 92.6, 7)).hasSize(7).last().isEqualTo(92.6);
	}

	@Test
	void tinyGoalsGetFewerMilestonesThatAreNeverEqualToTheStartOrEachOther() {
		assertThat(CheckpointPlanner.plan(80, 79.5, 10, 0.2)).containsExactly(79.8, 79.5);
		assertThat(CheckpointPlanner.plan(80, 81, 10, 0.2)).containsExactly(80.2, 80.4, 80.6, 80.8, 81.0);
		assertThat(CheckpointPlanner.plan(40, 42, 10, 0.5)).containsExactly(40.5, 41.0, 41.5, 42.0);
		assertThat(CheckpointPlanner.fits(80, 79.7, 2, 0.2)).isFalse();
		assertThatThrownBy(() -> CheckpointPlanner.plan(80, 79.7, 5, 0.2)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void everyPlanKeepsTheMinimumGap() {
		for (int start = 600; start <= 1200; start += 37) {
			for (int delta = 4; delta <= 60; delta += 3) {
				for (int count = CheckpointPlanner.MIN; count <= CheckpointPlanner.MAX; count++) {
					for (int sign : new int[] { -1, 1 }) {
						double from = start / 10.0 + 0.03;
						double to = Math.round((from + sign * delta / 10.0) * 10) / 10.0;
						if (!CheckpointPlanner.fits(from, to, CheckpointPlanner.MIN, 0.2)) {
							continue;
						}
						List<Double> targets = CheckpointPlanner.plan(from, to, count, 0.2);
						assertThat(targets).hasSizeBetween(CheckpointPlanner.MIN, count).last().isEqualTo(to);
						double previous = from;
						for (double target : targets) {
							assertThat(Math.abs(target - previous)).as("%s -> %s x%d: %s", from, to, count, targets).isGreaterThan(0.2 - 1e-6);
							assertThat(Math.signum(target - previous)).isEqualTo((double) sign);
							previous = target;
						}
					}
				}
			}
		}
	}

	@Test
	void supportsTwoToTenCheckpoints() {
		assertThat(CheckpointPlanner.plan(80, 70, 2)).containsExactly(75.0, 70.0);
		assertThat(CheckpointPlanner.plan(80, 70, 10)).hasSize(10).startsWith(79.0).endsWith(70.0);
		assertThatThrownBy(() -> CheckpointPlanner.plan(80, 70, 1)).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> CheckpointPlanner.plan(80, 70, 11)).isInstanceOf(IllegalArgumentException.class);
	}
}
