package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class AiCheckIntegrationTest extends IntegrationTest {

	private boolean stored(String completionId) {
		return jdbc.queryForObject("select p.ai_checked from proofs p join quest_completions c on c.proof_id = p.id where c.id = ?::uuid",
				Boolean.class, completionId);
	}

	@Test
	void onlyPhotosThatMatchTheQuestSayAiVerified() throws Exception {
		Session user = loginPro("AiMeals");
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = userQuestId(user, "HEALTHY_MEAL");
		patch(user, "/api/v1/quests/" + meal, "{\"perDay\":2}").andExpect(status().isOk());

		String ceiling = body(post(user, "/api/v1/quests/" + meal + "/complete",
				"{\"photoUrl\":\"%s\",\"mlLabels\":[\"Room\",\"Ceiling\"]}".formatted(uploadPhoto(user)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DONE"))
				.andExpect(jsonPath("$.summary").value("Photo proof")));
		String salad = body(post(user, "/api/v1/quests/" + meal + "/complete",
				"{\"photoUrl\":\"%s\",\"mlLabels\":[\"salad\"]}".formatted(uploadPhoto(user)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.summary").value("AI verified")));
		assertThat(stored(JsonPath.read(ceiling, "$.completionId"))).isFalse();
		assertThat(stored(JsonPath.read(salad, "$.completionId"))).isTrue();

		String weighIn = userQuestId(user, "WEIGH_IN");
		post(user, "/api/v1/quests/" + weighIn + "/complete", "{\"photoUrl\":\"%s\",\"value\":88.4,\"mlText\":\"Floor\"}"
				.formatted(uploadPhoto(user))).andExpect(status().isOk()).andExpect(jsonPath("$.summary").value("Photo proof"))
				.andExpect(jsonPath("$.value").value(88.4));
		assertThat(jdbc.queryForObject("select count(*) from proofs where user_id = ? and ai_checked", Integer.class, user.id())).isEqualTo(1);
	}

	@Test
	void friendsSeeTheAiChipOnlyForMatchingPhotosAndMilestonesStoreTheResult() throws Exception {
		Session owner = loginPro("AiFeed");
		Session friend = loginPro("AiFriend");
		befriend(owner, friend);
		addFriends(owner, 2);
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = userQuestId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"squadCheck\":true}").andExpect(status().isOk());
		String pending = body(post(owner, "/api/v1/quests/" + meal + "/complete",
				"{\"photoUrl\":\"%s\",\"mlLabels\":[\"Wall\"]}".formatted(uploadPhoto(owner))).andExpect(status().isOk()));
		get(friend, "/api/v1/proofs/" + JsonPath.read(pending, "$.proofId")).andExpect(jsonPath("$.post.aiChecked").value(false))
				.andExpect(jsonPath("$.post.subtitle").value("Photo proof"));

		String goal = body(get(owner, "/api/v1/goal").andExpect(status().isOk()));
		String first = JsonPath.read(goal, "$.checkpoints[0].id");
		String second = JsonPath.read(goal, "$.checkpoints[1].id");
		post(owner, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":84.9,\"mlLabels\":[\"Shoe\"]}"
				.formatted(uploadPhoto(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED"))
				.andExpect(jsonPath("$.aiChecked").value(false));
		post(owner, "/api/v1/checkpoints/" + second + "/proof", "{\"photoUrl\":\"%s\",\"value\":79.9,\"mlText\":\"79.9 kg\"}"
				.formatted(uploadPhoto(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.aiChecked").value(true));
	}
}
