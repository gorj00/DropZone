package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class FlowIntegrationTest extends IntegrationTest {

	@Test
	void devLoginOnboardingTodayAndCompleteQuests() throws Exception {
		Session user = login("Flow");
		get(user, "/api/v1/me").andExpect(status().isOk())
				.andExpect(jsonPath("$.onboarded").value(false))
				.andExpect(jsonPath("$.pro").value(false))
				.andExpect(jsonPath("$.minutesPerQuest").value(30));
		get(user, "/api/v1/goal").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));

		String onboarding = onboardLose(user, 4, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		assertThat((Boolean) JsonPath.read(onboarding, "$.user.onboarded")).isTrue();
		assertThat((String) JsonPath.read(onboarding, "$.user.path")).isEqualTo("LOSE");
		assertThat((List<String>) JsonPath.read(onboarding, "$.user.lockedApps")).containsExactly("com.instagram.android");
		assertThat((List<Double>) JsonPath.read(onboarding, "$.goal.checkpoints[*].targetValue")).containsExactly(87.5, 85.0, 82.5, 80.0);
		assertThat((List<String>) JsonPath.read(onboarding, "$.goal.checkpoints[*].status"))
				.containsExactly("ACTIVE", "LOCKED", "LOCKED", "LOCKED");
		assertThat((Boolean) JsonPath.read(onboarding, "$.goal.checkpoints[0].isPublic")).isFalse();
		assertThat((Double) JsonPath.read(onboarding, "$.goal.checkpoints[0].deltaToEarn")).isEqualTo(2.5);

		String today = body(get(user, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(3))
				.andExpect(jsonPath("$.doneCount").value(0))
				.andExpect(jsonPath("$.unlocked").value(false))
				.andExpect(jsonPath("$.friendsCleared").doesNotExist()));
		String meal = questId(today, "HEALTHY_MEAL");
		String steps = questId(today, "STEPS");

		String photo = uploadPhoto(user);
		assertThat(canonical(photo)).startsWith("https://storage.test/dropzone/uploads/" + user.id() + "/").endsWith(".png");
		post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\",\"mlLabels\":[\"Food\",\"Salad\"]}".formatted(photo))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE"))
				.andExpect(jsonPath("$.summary").value("AI verified"))
				.andExpect(jsonPath("$.proofId").isNotEmpty());
		post(user, "/api/v1/quests/" + meal + "/complete", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"));

		post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":5200}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("TODO"))
				.andExpect(jsonPath("$.progress").value(5200.0))
				.andExpect(jsonPath("$.target").value(8000));
		post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":8432}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("DONE"))
				.andExpect(jsonPath("$.summary").value("8,432 steps"));

		post(user, "/api/v1/weigh-ins", "{\"value\":88.2,\"photoUrl\":\"%s\",\"mlText\":\"88.2\"}".formatted(photoUrl(user)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.value").value(88.2))
				.andExpect(jsonPath("$.date").isNotEmpty());

		String done = body(get(user, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.doneCount").value(3))
				.andExpect(jsonPath("$.unlocked").value(true))
				.andExpect(jsonPath("$.unlockedUntil").isNotEmpty())
				.andExpect(jsonPath("$.streak").value(1)));
		assertThat((List<String>) JsonPath.read(done, "$.quests[?(@.quest.code=='WEIGH_IN')].summary"))
				.containsExactly("AI verified");
		assertThat((List<Double>) JsonPath.read(done, "$.quests[?(@.quest.code=='WEIGH_IN')].value")).containsExactly(88.2);
		get(user, "/api/v1/me").andExpect(jsonPath("$.streak").value(1)).andExpect(jsonPath("$.bestStreak").value(1));

		String goal = body(get(user, "/api/v1/goal").andExpect(status().isOk())
				.andExpect(jsonPath("$.currentValue").value(88.2))
				.andExpect(jsonPath("$.progressValue").value(1.8))
				.andExpect(jsonPath("$.totalValue").value(10.0)));
		String first = JsonPath.read(goal, "$.checkpoints[0].id");
		String second = JsonPath.read(goal, "$.checkpoints[1].id");

		post(user, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":88.0}".formatted(photoUrl(user)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"));
		post(user, "/api/v1/checkpoints/" + second + "/proof", "{\"photoUrl\":\"%s\",\"value\":84.0}".formatted(photoUrl(user)))
				.andExpect(status().isConflict());
		post(user, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":87.4,\"mlText\":\"87.4\"}".formatted(photoUrl(user)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED"))
				.andExpect(jsonPath("$.requiredVerifications").value(0))
				.andExpect(jsonPath("$.clearedAt").isNotEmpty());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[1].status").value("ACTIVE"))
				.andExpect(jsonPath("$.currentValue").value(88.2));

		patch(user, "/api/v1/checkpoints/" + second, "{\"rewardTitle\":\"New sneakers\",\"deadline\":\"2026-12-24\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rewardTitle").value("New sneakers"))
				.andExpect(jsonPath("$.deadline").value("2026-12-24"));
		patch(user, "/api/v1/checkpoints/" + second, "{\"deadline\":null}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.deadline").doesNotExist())
				.andExpect(jsonPath("$.rewardTitle").value("New sneakers"));
	}

	@Test
	void questsCanBeReplacedAndDeleted() throws Exception {
		Session user = login("Quests");
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String quests = body(put(user, "/api/v1/quests", "{\"codes\":[\"STEPS\",\"WEIGH_IN\"]}").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(quests, "$[*].code")).containsExactly("STEPS", "WEIGH_IN");
		String id = JsonPath.read(quests, "$[0].id");
		delete(user, "/api/v1/quests/" + id).andExpect(status().isNoContent());
		get(user, "/api/v1/quests").andExpect(jsonPath("$.length()").value(1));
		delete(user, "/api/v1/quests/" + id).andExpect(status().isNotFound());
		put(user, "/api/v1/quests", "{\"codes\":[\"NOPE\"]}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION"));
	}

	@Test
	void validationErrorsUseContractShape() throws Exception {
		Session user = login("Invalid");
		post(user, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":11,"questCodes":["WEIGH_IN"]}
				""").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.code").value("VALIDATION"));
		post(user, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":80,"goalValue":90,"checkpoints":3,"questCodes":["WEIGH_IN"]}
				""").andExpect(status().isBadRequest());
		mvc.perform(MockMvcRequestBuilders.multipart("/api/v1/uploads")
				.file(new MockMultipartFile("file", "note.txt", "text/plain", "hello".getBytes()))
				.header("Authorization", "Bearer " + user.token()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION"));
	}

	private static String questId(String today, String code) {
		List<String> ids = JsonPath.read(today, "$.quests[?(@.quest.code=='" + code + "')].quest.id");
		return ids.getFirst();
	}
}
