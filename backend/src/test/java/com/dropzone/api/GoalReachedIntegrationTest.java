package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class GoalReachedIntegrationTest extends IntegrationTest {

	private static final String NEXT = "{\"goalValue\":75,\"checkpoints\":2}";

	private void clear(Session session, int index, double value) throws Exception {
		String id = JsonPath.read(body(get(session, "/api/v1/goal")), "$.checkpoints[" + index + "].id");
		post(session, "/api/v1/checkpoints/" + id + "/proof", "{\"photoUrl\":\"%s\",\"value\":%s}".formatted(uploadPhoto(session), value))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLEARED"));
	}

	@Test
	void aReachedGoalMakesRoomForTheNextOneAndStaysInHistory() throws Exception {
		Session user = login("Finisher");
		String first = JsonPath.read(onboardLose(user, 2, "WEIGH_IN"), "$.goal.id");
		get(user, "/api/v1/goals/history").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
		post(user, "/api/v1/goal", NEXT).andExpect(status().isConflict());

		clear(user, 0, 84.9);
		get(user, "/api/v1/goal").andExpect(jsonPath("$.reached").value(false));
		post(user, "/api/v1/weigh-ins", "{\"value\":79.6}").andExpect(status().isOk());
		clear(user, 1, 79.6);
		get(user, "/api/v1/goal").andExpect(jsonPath("$.reached").value(true));

		post(user, "/api/v1/goal", "{\"goalValue\":81,\"checkpoints\":2}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("goalValue must be below startValue when losing"));
		post(user, "/api/v1/goal", "{\"metric\":\"SIZE\",\"startValue\":90,\"goalValue\":80,\"checkpoints\":2}").andExpect(status().isBadRequest());
		String next = body(post(user, "/api/v1/goal", NEXT).andExpect(status().isOk())
				.andExpect(jsonPath("$.metric").value("WEIGHT"))
				.andExpect(jsonPath("$.startValue").value(79.6))
				.andExpect(jsonPath("$.currentValue").value(79.6))
				.andExpect(jsonPath("$.goalValue").value(75.0))
				.andExpect(jsonPath("$.reached").value(false))
				.andExpect(jsonPath("$.checkpoints.length()").value(2))
				.andExpect(jsonPath("$.checkpoints[0].status").value("ACTIVE"))
				.andExpect(jsonPath("$.checkpoints[1].status").value("LOCKED")));
		assertThat((String) JsonPath.read(next, "$.id")).isNotEqualTo(first);
		get(user, "/api/v1/goal").andExpect(jsonPath("$.id").value((String) JsonPath.read(next, "$.id")));
		assertThat(jdbc.queryForObject("select count(*) from goals where user_id = ? and active", Integer.class, user.id())).isEqualTo(1);

		get(user, "/api/v1/goals/history").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].id").value(first))
				.andExpect(jsonPath("$[0].startValue").value(90.0))
				.andExpect(jsonPath("$[0].goalValue").value(80.0))
				.andExpect(jsonPath("$[0].endValue").value(79.6))
				.andExpect(jsonPath("$[0].reached").value(true))
				.andExpect(jsonPath("$[0].reachedAt").exists())
				.andExpect(jsonPath("$[0].endedAt").exists())
				.andExpect(jsonPath("$[0].milestones").value(2))
				.andExpect(jsonPath("$[0].milestonesCleared").value(2));
		post(user, "/api/v1/goal", NEXT).andExpect(status().isConflict());
		String export = body(get(user, "/api/v1/me/export").andExpect(status().isOk()));
		assertThat((java.util.List<Object>) JsonPath.read(export, "$.goals[*].id")).hasSize(2);
	}

	@Test
	void aNewGoalNeedsAFinishedOnboarding() throws Exception {
		Session user = login("NoGoalYet");
		post(user, "/api/v1/goal", NEXT).andExpect(status().isConflict());
		post(user, "/api/v1/goal", "{\"goalValue\":75}").andExpect(status().isBadRequest());
	}
}
