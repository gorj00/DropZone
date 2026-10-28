package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class ProGatingIntegrationTest extends IntegrationTest {

	@Test
	void freeUsersGet402ForProFeatures() throws Exception {
		Session free = login("Free");
		proRequired(post(free, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":4,"questCodes":["WEIGH_IN","GYM"]}
				"""));
		proRequired(post(free, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":4,"questCodes":["WEIGH_IN"],
				 "lockedApps":["com.zhiliaoapp.musically"]}
				"""));
		proRequired(post(free, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":4,"questCodes":["WEIGH_IN"],
				 "unlockMode":"MINUTES"}
				"""));
		onboardLose(free, 3, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");

		proRequired(patch(free, "/api/v1/me", "{\"unlockMode\":\"MINUTES\"}"));
		proRequired(patch(free, "/api/v1/me", "{\"publicByDefault\":true}"));
		proRequired(patch(free, "/api/v1/me", "{\"defaultVerification\":\"COMMUNITY\"}"));
		proRequired(put(free, "/api/v1/me/locked-apps", "{\"packages\":[\"com.instagram.android\",\"com.zhiliaoapp.musically\"]}"));
		proRequired(put(free, "/api/v1/quests", "{\"codes\":[\"WEIGH_IN\",\"SWIM\"]}"));
		proRequired(post(free, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"CHECKIN","group":"RECOVERY","days":[1,2,3],"squadCheck":false}
				"""));
		proRequired(get(free, "/api/v1/social/friends"));
		proRequired(get(free, "/api/v1/social/search?q=abc"));
		proRequired(get(free, "/api/v1/social/invite"));
		proRequired(get(free, "/api/v1/feed?scope=EVERYONE"));
		proRequired(get(free, "/api/v1/feed/pending-count"));
		proRequired(get(free, "/api/v1/leaderboard?period=WEEK"));
		proRequired(get(free, "/api/v1/stats?month=2026-10"));
		proRequired(post(free, "/api/v1/slip-ups", "{\"type\":\"LATE_SNACK\"}"));

		String goal = body(get(free, "/api/v1/goal").andExpect(status().isOk()));
		String checkpoint = JsonPath.read(goal, "$.checkpoints[0].id");
		proRequired(patch(free, "/api/v1/checkpoints/" + checkpoint, "{\"isPublic\":true}"));
		proRequired(patch(free, "/api/v1/checkpoints/" + checkpoint, "{\"verification\":\"COMMUNITY\"}"));

		put(free, "/api/v1/me/locked-apps", "{\"packages\":[\"com.instagram.android\"]}").andExpect(status().isOk());
		patch(free, "/api/v1/me", "{\"theme\":\"STEALTH\",\"handle\":\"free.dropper\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.theme").value("STEALTH"));
	}

	@Test
	void proUsersCanUseProFeatures() throws Exception {
		Session pro = loginPro("Pro");
		onboardLose(pro, 3, "WEIGH_IN", "GYM", "SWIM", "CAMERA_REPS");
		patch(pro, "/api/v1/me", "{\"unlockMode\":\"MINUTES\",\"minutesPerQuest\":20}").andExpect(status().isOk())
				.andExpect(jsonPath("$.unlockMode").value("MINUTES"));
		post(pro, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"CHECKIN","group":"RECOVERY","days":[1,2,3,4,5,6,7],"squadCheck":false}
				""").andExpect(status().isOk()).andExpect(jsonPath("$.custom").value(true));
		get(pro, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(5))
				.andExpect(jsonPath("$.friendsCleared.total").value(0));
		get(pro, "/api/v1/leaderboard?period=MONTH").andExpect(status().isOk())
				.andExpect(jsonPath("$.path").value("LOSE"))
				.andExpect(jsonPath("$.metric").value("WEIGHT"))
				.andExpect(jsonPath("$.entries[0].user.id").value(pro.id().toString()));
		post(pro, "/api/v1/slip-ups", "{\"type\":\"LATE_SNACK\",\"note\":\"chips\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.type").value("LATE_SNACK"));
		get(pro, "/api/v1/stats").andExpect(status().isOk())
				.andExpect(jsonPath("$.slipUpCount").value(1))
				.andExpect(jsonPath("$.topSlipUps[0].name").value("Late snack"));
	}

	private static void proRequired(ResultActions result) throws Exception {
		result.andExpect(status().isPaymentRequired())
				.andExpect(jsonPath("$.status").value(402))
				.andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
	}
}
