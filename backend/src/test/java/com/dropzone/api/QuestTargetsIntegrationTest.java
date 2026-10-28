package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class QuestTargetsIntegrationTest extends IntegrationTest {

	@Test
	void stepGoalIsTheUsersOwnAndDrivesCompletion() throws Exception {
		Session session = login("StepGoal");
		onboardLose(session, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		String steps = questId(session, "STEPS");

		patch(session, "/api/v1/quests/" + steps, "{\"target\":12000}").andExpect(status().isOk())
				.andExpect(jsonPath("$.target").value(12000));
		post(session, "/api/v1/quests/" + steps + "/complete", "{\"value\":9000}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO")).andExpect(jsonPath("$.target").value(12000));
		post(session, "/api/v1/quests/" + steps + "/complete", "{\"value\":12500}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE"));

		patch(session, "/api/v1/quests/" + steps, "{\"target\":500}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + steps, "{\"target\":60000}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + questId(session, "WEIGH_IN"), "{\"target\":5000}").andExpect(status().isBadRequest());
	}

	@Test
	void sleepGoalRenamesTheQuestAndOnboardingAcceptsTargets() throws Exception {
		Session session = loginTrial("SleepGoal");
		String onboarding = body(post(session, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"WEIGHT","unit":"kg","startValue":70,"goalValue":78,"checkpoints":2,
				 "questCodes":["WEIGH_IN","GYM","SLEEP","STEPS"],"lockedApps":[],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"STEPS","target":6000},{"code":"SLEEP","target":450}]}
				""").andExpect(status().isOk()));
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		List<Integer> stepTargets = JsonPath.read(list, "$[?(@.code=='STEPS')].target");
		List<String> sleepNames = JsonPath.read(list, "$[?(@.code=='SLEEP')].name");
		assertThat(stepTargets).containsExactly(6000);
		assertThat(sleepNames).containsExactly("Sleep 7.5 h");
		assertThat(onboarding).isNotBlank();

		String sleep = questId(session, "SLEEP");
		patch(session, "/api/v1/quests/" + sleep, "{\"target\":200}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + sleep, "{\"target\":540}").andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Sleep 9 h"));
	}

	@Test
	void customQuestsCanUseNoneProof() throws Exception {
		Session session = loginPro("NoneProof");
		onboardLose(session, 2, "WEIGH_IN");
		String created = body(post(session, "/api/v1/quests/custom", """
				{"name":"Stretch","icon":"mobility","proof":"NONE","group":"BURN_FUEL","days":[1,2,3,4,5,6,7],"squadCheck":false}
				""").andExpect(status().isOk()).andExpect(jsonPath("$.proof").value("NONE")));
		String id = JsonPath.read(created, "$.id");
		post(session, "/api/v1/quests/" + id + "/complete", "{}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE")).andExpect(jsonPath("$.summary").value("Done"));
		post(session, "/api/v1/quests/custom", """
				{"name":"Walk","icon":"steps","proof":"AUTO","group":"BURN_FUEL","days":[1,2,3,4,5,6,7],"squadCheck":false}
				""").andExpect(status().isBadRequest());
	}

	@Test
	void repGoalIsTheUsersOwnWithinBounds() throws Exception {
		Session session = loginPro("RepGoal");
		post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":2,
				 "questCodes":["CAMERA_REPS","GYM"],"lockedApps":[],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"CAMERA_REPS","target":40}]}
				""").andExpect(status().isOk());
		String reps = questId(session, "CAMERA_REPS");
		get(session, "/api/v1/quests").andExpect(jsonPath("$[?(@.code=='CAMERA_REPS')].target").value(40));

		patch(session, "/api/v1/quests/" + reps, "{\"target\":4}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + reps, "{\"target\":201}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + reps, "{\"target\":5}").andExpect(status().isOk()).andExpect(jsonPath("$.target").value(5));
		patch(session, "/api/v1/quests/" + reps, "{\"target\":200}").andExpect(status().isOk()).andExpect(jsonPath("$.target").value(200));
		put(session, "/api/v1/quests", "{\"codes\":[\"CAMERA_REPS\",\"GYM\"],\"settings\":[{\"code\":\"CAMERA_REPS\",\"target\":10}]}")
				.andExpect(status().isOk()).andExpect(jsonPath("$[?(@.code=='CAMERA_REPS')].target").value(10));
		put(session, "/api/v1/quests", "{\"codes\":[\"CAMERA_REPS\"],\"settings\":[{\"code\":\"CAMERA_REPS\",\"target\":300}]}")
				.andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + questId(session, "GYM"), "{\"target\":20}").andExpect(status().isBadRequest());

		Session other = loginPro("RepGoalOnboarding");
		post(other, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"WEIGHT","unit":"kg","startValue":70,"goalValue":78,"checkpoints":2,
				 "questCodes":["CAMERA_REPS"],"lockedApps":[],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"CAMERA_REPS","target":3}]}
				""").andExpect(status().isBadRequest());
		get(other, "/api/v1/me").andExpect(jsonPath("$.onboarded").value(false));
	}

	@Test
	void pushUpsNeedHalfTheSquatGoalInOneSession() throws Exception {
		Session session = loginPro("PushUps");
		onboardLose(session, 2, "CAMERA_REPS", "GYM");
		String reps = questId(session, "CAMERA_REPS");
		patch(session, "/api/v1/quests/" + reps, "{\"target\":15}").andExpect(status().isOk());

		post(session, "/api/v1/quests/" + reps + "/complete", "{\"reps\":7,\"exercise\":\"PUSHUP\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO")).andExpect(jsonPath("$.progress").value(7.0))
				.andExpect(jsonPath("$.target").value(15));
		post(session, "/api/v1/quests/" + reps + "/complete", "{\"reps\":12,\"exercise\":\"SQUAT\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO")).andExpect(jsonPath("$.progress").value(12.0));
		post(session, "/api/v1/quests/" + reps + "/complete", "{\"reps\":3,\"exercise\":\"PUSHUP\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO")).andExpect(jsonPath("$.progress").value(12.0));
		post(session, "/api/v1/quests/" + reps + "/complete", "{\"reps\":8,\"exercise\":\"PUSHUP\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE")).andExpect(jsonPath("$.summary").value("8 reps"));

		Session squats = loginPro("Squats");
		onboardLose(squats, 2, "CAMERA_REPS", "GYM");
		String squatQuest = questId(squats, "CAMERA_REPS");
		post(squats, "/api/v1/quests/" + squatQuest + "/complete", "{\"reps\":10,\"exercise\":\"PUSHUP\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE"));

		Session older = loginPro("OlderApp");
		onboardLose(older, 2, "CAMERA_REPS", "GYM");
		String olderQuest = questId(older, "CAMERA_REPS");
		post(older, "/api/v1/quests/" + olderQuest + "/complete", "{\"reps\":19}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO")).andExpect(jsonPath("$.target").value(20));
		post(older, "/api/v1/quests/" + olderQuest + "/complete", "{\"reps\":20,\"exercise\":\"BURPEE\"}").andExpect(status().isBadRequest());
		post(older, "/api/v1/quests/" + olderQuest + "/complete", "{\"reps\":20}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE"));
	}

	@SuppressWarnings("unchecked")
	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
