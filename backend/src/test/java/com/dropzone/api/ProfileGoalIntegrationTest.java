package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class ProfileGoalIntegrationTest extends IntegrationTest {

	@Test
	void handleAvailabilityAndUniqueness() throws Exception {
		Session first = login("HandleOwner");
		Session second = login("HandleSeeker");

		get(first, "/api/v1/users/handle-available?handle=" + first.handle()).andExpect(status().isOk())
				.andExpect(jsonPath("$.valid").value(true))
				.andExpect(jsonPath("$.available").value(true));
		get(second, "/api/v1/users/handle-available?handle=@" + first.handle().toUpperCase()).andExpect(status().isOk())
				.andExpect(jsonPath("$.handle").value(first.handle()))
				.andExpect(jsonPath("$.available").value(false))
				.andExpect(jsonPath("$.message").value("Handle is taken"));
		get(second, "/api/v1/users/handle-available?handle=ab").andExpect(jsonPath("$.valid").value(false));

		patch(second, "/api/v1/me", "{\"handle\":\"" + first.handle() + "\"}").andExpect(status().isConflict());
		patch(second, "/api/v1/me", "{\"handle\":\"Fresh.Name_1\",\"displayName\":\"Fresh Name\",\"bio\":\"  Dropping 10 kg by summer  \"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.handle").value("fresh.name_1"))
				.andExpect(jsonPath("$.displayName").value("Fresh Name"))
				.andExpect(jsonPath("$.bio").value("Dropping 10 kg by summer"));
		patch(second, "/api/v1/me", "{\"bio\":\"" + "x".repeat(151) + "\"}").andExpect(status().isBadRequest());
		patch(second, "/api/v1/me", "{\"displayName\":\"   \"}").andExpect(status().isBadRequest());
		patch(second, "/api/v1/me", "{\"bio\":\"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.bio").doesNotExist());
	}

	@Test
	void editingTheGoalRespreadsOpenMilestones() throws Exception {
		Session user = login("GoalEditor");
		onboardLose(user, 4, "WEIGH_IN");

		patch(user, "/api/v1/goal", "{\"goalValue\":78}").andExpect(status().isOk())
				.andExpect(jsonPath("$.goalValue").value(78.0))
				.andExpect(jsonPath("$.checkpoints[0].targetValue").value(87.0))
				.andExpect(jsonPath("$.checkpoints[1].targetValue").value(84.0))
				.andExpect(jsonPath("$.checkpoints[2].targetValue").value(81.0))
				.andExpect(jsonPath("$.checkpoints[3].targetValue").value(78.0));
		patch(user, "/api/v1/goal", "{\"startValue\":94}").andExpect(status().isOk())
				.andExpect(jsonPath("$.startValue").value(94.0))
				.andExpect(jsonPath("$.currentValue").value(94.0))
				.andExpect(jsonPath("$.checkpoints[0].targetValue").value(90.0))
				.andExpect(jsonPath("$.checkpoints[3].targetValue").value(78.0));
		patch(user, "/api/v1/goal", "{\"goalValue\":95}").andExpect(status().isBadRequest());

		String goal = body(get(user, "/api/v1/goal"));
		String first = JsonPath.read(goal, "$.checkpoints[0].id");
		post(user, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"" + photoUrl(user) + "\",\"value\":89.5}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED"));

		patch(user, "/api/v1/goal", "{\"startValue\":96}").andExpect(status().isConflict());
		patch(user, "/api/v1/goal", "{\"goalValue\":91}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/goal", "{\"goalValue\":75}").andExpect(status().isOk())
				.andExpect(jsonPath("$.checkpoints[0].targetValue").value(90.0))
				.andExpect(jsonPath("$.checkpoints[1].targetValue").value(85.0))
				.andExpect(jsonPath("$.checkpoints[2].targetValue").value(80.0))
				.andExpect(jsonPath("$.checkpoints[3].targetValue").value(75.0));
		patch(user, "/api/v1/checkpoints/" + first, "{\"targetValue\":89}").andExpect(status().isConflict());
	}

	@Test
	void milestoneTargetsMustStayBetweenTheirNeighbours() throws Exception {
		Session user = login("MilestoneMover");
		String onboarding = onboardLose(user, 4, "WEIGH_IN");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		String last = JsonPath.read(onboarding, "$.goal.checkpoints[3].id");

		patch(user, "/api/v1/checkpoints/" + second, "{\"targetValue\":84}").andExpect(status().isOk())
				.andExpect(jsonPath("$.targetValue").value(84.0));
		patch(user, "/api/v1/checkpoints/" + second, "{\"targetValue\":88}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/checkpoints/" + second, "{\"targetValue\":82.5}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/checkpoints/" + second, "{\"targetValue\":\"x\"}").andExpect(status().isBadRequest());

		patch(user, "/api/v1/checkpoints/" + last, "{\"targetValue\":76}").andExpect(status().isOk());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.goalValue").value(76.0))
				.andExpect(jsonPath("$.checkpoints[0].targetValue").value(86.5))
				.andExpect(jsonPath("$.checkpoints[3].targetValue").value(76.0));
	}

	@Test
	void gainGoalsMoveUpwards() throws Exception {
		Session user = login("BuilderEdit");
		String onboarding = body(post(user, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"STRENGTH","metricLabel":"Bench press","unit":"kg","startValue":60,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN","GYM"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk()));
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");

		patch(user, "/api/v1/checkpoints/" + first, "{\"targetValue\":72.5}").andExpect(status().isOk());
		patch(user, "/api/v1/checkpoints/" + first, "{\"targetValue\":58}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/goal", "{\"goalValue\":55}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/goal", "{\"goalValue\":100}").andExpect(status().isOk())
				.andExpect(jsonPath("$.checkpoints[0].targetValue").value(80.0))
				.andExpect(jsonPath("$.checkpoints[1].targetValue").value(100.0));
	}
}
