package com.dropzone.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
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

	@Test
	void freeIphoneUsersCanLockAnyOneApp() throws Exception {
		Session free = login("Iphone");
		proRequired(from("ios", HttpMethod.POST, free, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":4,"questCodes":["WEIGH_IN"],
				 "lockedApps":["com.zhiliaoapp.musically","com.google.ios.youtube"]}
				""")).andExpect(jsonPath("$.message").value("Locking more than one app is a PRO feature"));
		from("ios", HttpMethod.POST, free, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":4,"questCodes":["WEIGH_IN"],
				 "lockedApps":["com.zhiliaoapp.musically"]}
				""").andExpect(status().isOk())
				.andExpect(jsonPath("$.user.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.user.lockedApps[0]").value("com.zhiliaoapp.musically"));

		from("iOS", HttpMethod.PUT, free, "/api/v1/me/locked-apps", "{\"packages\":[\"com.google.ios.youtube\"]}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.google.ios.youtube"));
		proRequired(from("ios", HttpMethod.PUT, free, "/api/v1/me/locked-apps",
				"{\"packages\":[\"com.google.ios.youtube\",\"com.instagram.android\"]}"))
				.andExpect(jsonPath("$.message").value("Locking more than one app is a PRO feature"));
		from("ios", HttpMethod.GET, free, "/api/v1/me", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.google.ios.youtube"));

		get(free, "/api/v1/me").andExpect(status().isOk()).andExpect(jsonPath("$.lockedApps.length()").value(0));
		from("android", HttpMethod.GET, free, "/api/v1/me", null).andExpect(jsonPath("$.lockedApps.length()").value(0));
		from("web", HttpMethod.GET, free, "/api/v1/me", null).andExpect(jsonPath("$.lockedApps.length()").value(0));
		for (String platform : new String[] { null, "android", "web", "ipados" }) {
			proRequired(from(platform, HttpMethod.PUT, free, "/api/v1/me/locked-apps", "{\"packages\":[\"com.google.ios.youtube\"]}"))
					.andExpect(jsonPath("$.message").value("Locking apps other than Instagram is a PRO feature"));
		}
		from("ios", HttpMethod.PUT, free, "/api/v1/me/locked-apps", "{\"packages\":[]}").andExpect(status().isOk())
				.andExpect(jsonPath("$.lockedApps.length()").value(0));
	}

	@Test
	void exProIphoneUsersKeepOneLockedApp() throws Exception {
		Session session = loginTrial("IphoneTrial");
		from("ios", HttpMethod.PUT, session, "/api/v1/me/locked-apps",
				"{\"packages\":[\"com.zhiliaoapp.musically\",\"com.google.ios.youtube\",\"com.burbn.barcelona\"]}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.lockedApps.length()").value(3));
		endTrial(session);
		from("ios", HttpMethod.GET, session, "/api/v1/me", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.burbn.barcelona"));
		get(session, "/api/v1/me").andExpect(jsonPath("$.lockedApps.length()").value(0));

		jdbc.update("insert into user_locked_apps (user_id, package_name) values (?, ?)", session.id(), "com.instagram.android");
		from("ios", HttpMethod.GET, session, "/api/v1/me", null)
				.andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.instagram.android"));
		get(session, "/api/v1/me").andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.instagram.android"));

		makePro(session);
		from("ios", HttpMethod.GET, session, "/api/v1/me", null).andExpect(jsonPath("$.lockedApps.length()").value(4));
	}

	private ResultActions from(String platform, HttpMethod method, Session session, String url, String json) throws Exception {
		var builder = request(method, url).header("Authorization", "Bearer " + session.token());
		if (platform != null) {
			builder.header("X-Platform", platform);
		}
		if (json != null) {
			builder.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return mvc.perform(builder);
	}

	private static ResultActions proRequired(ResultActions result) throws Exception {
		return result.andExpect(status().isPaymentRequired())
				.andExpect(jsonPath("$.status").value(402))
				.andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
	}
}
