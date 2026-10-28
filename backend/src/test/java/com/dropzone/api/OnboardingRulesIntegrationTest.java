package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class OnboardingRulesIntegrationTest extends IntegrationTest {

	private static String onboarding(String path, String metric, String unit, double start, double goal) {
		return """
				{"path":"%s","metric":"%s","unit":"%s","startValue":%s,"goalValue":%s,"checkpoints":2,
				 "questCodes":["WEIGH_IN"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""".formatted(path, metric, unit, start, goal);
	}

	@Test
	void valuesMustBeWithinTheMetricRange() throws Exception {
		Session user = login("Bounds");
		post(user, "/api/v1/onboarding", onboarding("LOSE", "WEIGHT", "kg", 5000, 80)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("startValue must be between 20 and 350 kg"));
		post(user, "/api/v1/onboarding", onboarding("LOSE", "WEIGHT", "kg", 90, 10)).andExpect(status().isBadRequest());
		post(user, "/api/v1/onboarding", onboarding("GAIN", "STRENGTH", "kg", 60, 600)).andExpect(status().isBadRequest());
		post(user, "/api/v1/onboarding", onboarding("GAIN", "SIZE", "cm", 3, 40)).andExpect(status().isBadRequest());
		get(user, "/api/v1/me").andExpect(jsonPath("$.onboarded").value(false));
	}

	@Test
	void unitMustMatchTheMetric() throws Exception {
		Session user = login("Units");
		post(user, "/api/v1/onboarding", onboarding("LOSE", "WEIGHT", "cm", 90, 80)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("WEIGHT goals use kg"));
		post(user, "/api/v1/onboarding", onboarding("GAIN", "STRENGTH", "cm", 60, 80)).andExpect(status().isBadRequest());
		post(user, "/api/v1/onboarding", onboarding("GAIN", "SIZE", "kg", 35, 40)).andExpect(status().isBadRequest());
		post(user, "/api/v1/onboarding", onboarding("GAIN", "SIZE", "cm", 35, 40)).andExpect(status().isOk());
	}

	@Test
	void secondOnboardingIsRejected() throws Exception {
		Session user = login("Twice");
		onboardLose(user, 2, "WEIGH_IN");
		post(user, "/api/v1/onboarding", onboarding("LOSE", "WEIGHT", "kg", 95, 85)).andExpect(status().isConflict());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.startValue").value(90.0));
		assertThat(activeGoals(user.id())).isEqualTo(1);
	}

	@Test
	void concurrentDoubleSubmitCreatesOneGoal() throws Exception {
		Session user = login("Double");
		CountDownLatch start = new CountDownLatch(1);
		List<CompletableFuture<Integer>> calls = new ArrayList<>();
		for (int i = 0; i < 2; i++) {
			calls.add(CompletableFuture.supplyAsync(() -> {
				try {
					start.await();
					return post(user, "/api/v1/onboarding", onboarding("LOSE", "WEIGHT", "kg", 90, 80)).andReturn().getResponse().getStatus();
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			}));
		}
		start.countDown();
		List<Integer> statuses = calls.stream().map(CompletableFuture::join).sorted().toList();
		assertThat(statuses).containsExactly(200, 409);
		assertThat(activeGoals(user.id())).isEqualTo(1);
	}

	@Test
	void databaseAllowsOneActiveGoalPerUser() throws Exception {
		Session user = login("OneGoal");
		onboardLose(user, 2, "WEIGH_IN");
		assertThatThrownBy(() -> jdbc.update("""
				insert into goals (id, user_id, path, metric, unit, start_value, goal_value, current_value, active)
				values (?, ?, 'LOSE', 'WEIGHT', 'kg', 90, 80, 90, true)
				""", UUID.randomUUID(), user.id())).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void goalEditsAndProgressUseTheSameBounds() throws Exception {
		Session user = login("Edits");
		String goal = onboardLose(user, 2, "WEIGH_IN");
		String checkpoint = JsonPath.read(goal, "$.goal.checkpoints[0].id");
		patch(user, "/api/v1/goal", "{\"goalValue\":3}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/goal", "{\"startValue\":400}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"targetValue\":15}").andExpect(status().isBadRequest());
		post(user, "/api/v1/checkpoints/" + checkpoint + "/proof", "{\"photoUrl\":\"" + photoUrl(user) + "\",\"value\":5}")
				.andExpect(status().isBadRequest());

		Session lifter = login("Lifter");
		post(lifter, "/api/v1/onboarding", onboarding("GAIN", "STRENGTH", "kg", 60, 80)).andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":600}").andExpect(status().isBadRequest());
		post(lifter, "/api/v1/goal/progress", "{\"value\":70}").andExpect(status().isOk());
	}

	private int activeGoals(UUID userId) {
		return jdbc.queryForObject("select count(*) from goals where user_id = ? and active", Integer.class, userId);
	}
}
