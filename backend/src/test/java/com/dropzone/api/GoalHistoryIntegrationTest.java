package com.dropzone.api;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class GoalHistoryIntegrationTest extends IntegrationTest {

	private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

	private void startedDaysAgo(Session session, int days) {
		jdbc.update("update goals set created_at = now() - cast(? as interval) where user_id = ?", days + " days", session.id());
	}

	private void weighInOn(Session session, LocalDate day, double value) {
		jdbc.update("insert into weigh_ins (id, user_id, day, value) values (?, ?, ?, ?)", UUID.randomUUID(), session.id(), day, value);
	}

	@Test
	void weightHistoryHasTheLastWeighInOfEachDaySinceTheGoalStarted() throws Exception {
		Session user = loginPro("HistoryLoser");
		onboardLose(user, 2, "WEIGH_IN");
		startedDaysAgo(user, 3);
		weighInOn(user, today.minusDays(5), 91);
		weighInOn(user, today.minusDays(2), 89.4);
		post(user, "/api/v1/weigh-ins", "{\"value\":25}").andExpect(status().isOk());
		post(user, "/api/v1/weigh-ins", "{\"value\":88.5}").andExpect(status().isOk());

		get(user, "/api/v1/goal/history").andExpect(status().isOk())
				.andExpect(jsonPath("$.start").value(today.minusDays(3).toString()))
				.andExpect(jsonPath("$.points", hasSize(2)))
				.andExpect(jsonPath("$.points[0].day").value(today.minusDays(2).toString()))
				.andExpect(jsonPath("$.points[0].value").value(89.4))
				.andExpect(jsonPath("$.points[1].value").value(88.5));
	}

	@Test
	void liftHistoryKeepsTheBestLiftOfEachDay() throws Exception {
		Session lifter = loginPro("HistoryLifter");
		post(lifter, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"STRENGTH","metricLabel":"Bench press","unit":"kg","startValue":60,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN","GYM"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		startedDaysAgo(lifter, 2);
		post(lifter, "/api/v1/goal/progress", "{\"value\":62.5,\"date\":\"%s\"}".formatted(today.minusDays(1))).andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":70}").andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":65}").andExpect(status().isOk());

		get(lifter, "/api/v1/goal/history").andExpect(status().isOk())
				.andExpect(jsonPath("$.points", hasSize(2)))
				.andExpect(jsonPath("$.points[0].value").value(62.5))
				.andExpect(jsonPath("$.points[1].day").value(today.toString()))
				.andExpect(jsonPath("$.points[1].value").value(70.0));
	}

	@Test
	void historyIsPro() throws Exception {
		Session free = login("HistoryFree");
		onboardLose(free, 2, "WEIGH_IN");
		get(free, "/api/v1/goal/history").andExpect(status().isPaymentRequired());
	}
}
