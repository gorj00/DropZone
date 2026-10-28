package com.dropzone.api.rules;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.domain.Metric;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiCheckTest {

	@Test
	void questPhotosMustShowWhatTheQuestIsAbout() {
		assertThat(AiCheck.quest("HEALTHY_MEAL", List.of("Room", "Food"), null)).isTrue();
		assertThat(AiCheck.quest("PROTEIN_MEAL", List.of(" baked GOODS "), null)).isTrue();
		assertThat(AiCheck.quest("HEALTHY_MEAL", List.of("Room", "Ceiling"), null)).isFalse();
		assertThat(AiCheck.quest("GYM", List.of("Weight training"), null)).isTrue();
		assertThat(AiCheck.quest("GYM", List.of("Food"), null)).isFalse();
		assertThat(AiCheck.quest("HEALTHY_MEAL", List.of(), "Pasta 200 g")).isFalse();
		assertThat(AiCheck.quest("HEALTHY_MEAL", null, null)).isFalse();
		assertThat(AiCheck.quest("NEW_HOBBY", List.of("Food"), null)).isFalse();
		assertThat(AiCheck.quest(null, List.of("Food"), null)).isFalse();
	}

	@Test
	void weighInsPassWithAScaleReadingOrAScaleLabel() {
		assertThat(AiCheck.quest("WEIGH_IN", List.of(), "82.4 kg")).isTrue();
		assertThat(AiCheck.quest("WEIGH_IN", List.of(), "181,6")).isTrue();
		assertThat(AiCheck.quest("WEIGH_IN", List.of("Weighing scale"), null)).isTrue();
		assertThat(AiCheck.quest("WEIGH_IN", List.of("Floor"), "SALE 5")).isFalse();
		assertThat(AiCheck.quest("WEIGH_IN", List.of("Floor"), "1234567")).isFalse();
		assertThat(AiCheck.quest("WEIGH_IN", List.of(), "")).isFalse();
	}

	@Test
	void milestoneProofsFollowTheGoalMetric() {
		assertThat(AiCheck.milestone(Metric.WEIGHT, List.of(), "79.9")).isTrue();
		assertThat(AiCheck.milestone(Metric.WEIGHT, List.of("Shoe"), null)).isFalse();
		assertThat(AiCheck.milestone(Metric.STRENGTH, List.of("Barbell"), null)).isTrue();
		assertThat(AiCheck.milestone(Metric.STRENGTH, List.of(), "100")).isFalse();
		assertThat(AiCheck.milestone(Metric.SIZE, List.of("Tape measure"), null)).isTrue();
	}
}
