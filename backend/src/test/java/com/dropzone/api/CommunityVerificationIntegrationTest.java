package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class CommunityVerificationIntegrationTest extends IntegrationTest {

	@Test
	void publicCheckpointIsClearedAfterThreeVerifies() throws Exception {
		Session owner = loginPro("Owner");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String onboarding = onboardLose(owner, 2, "WEIGH_IN", "GYM");
		String checkpoint = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		assertThat((String) JsonPath.read(onboarding, "$.goal.checkpoints[0].verification")).isEqualTo("COMMUNITY");
		assertThat((Boolean) JsonPath.read(onboarding, "$.goal.checkpoints[0].isPublic")).isTrue();
		assertThat((Integer) JsonPath.read(onboarding, "$.goal.checkpoints[0].requiredVerifications")).isEqualTo(3);

		String submitted = body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":84.9,\"mlLabels\":[\"Scale\"]}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_VERIFICATION"))
				.andExpect(jsonPath("$.verifiedCount").value(0))
				.andExpect(jsonPath("$.requiredVerifications").value(3)));
		String proofId = JsonPath.read(submitted, "$.proofId");

		post(owner, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("FORBIDDEN"));
		Session free = login("FreeVerifier");
		post(free, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isPaymentRequired());

		Session first = loginPro("Verifier1");
		Session second = loginPro("Verifier2");
		Session third = loginPro("Verifier3");
		String everyone = body(get(first, "/api/v1/feed?scope=EVERYONE&limit=50").andExpect(status().isOk()));
		assertThat((List<Boolean>) JsonPath.read(everyone,
				"$[?(@.proofId=='" + proofId + "' && @.type=='CHECKPOINT_PROOF')].verification.canVerify")).containsExactly(true);
		get(first, "/api/v1/feed/pending-count").andExpect(status().isOk()).andExpect(jsonPath("$.count").isNumber());

		post(first, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.type").value("CHECKPOINT_PROOF"))
				.andExpect(jsonPath("$.verification.count").value(1))
				.andExpect(jsonPath("$.verification.required").value(3))
				.andExpect(jsonPath("$.verification.verifiedByMe").value(true))
				.andExpect(jsonPath("$.verification.canVerify").value(false));
		post(first, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"));
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].status").value("PENDING_VERIFICATION"))
				.andExpect(jsonPath("$.checkpoints[0].verifiedCount").value(1));

		post(second, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk());
		post(third, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.verification.count").value(3));

		get(owner, "/api/v1/goal").andExpect(status().isOk())
				.andExpect(jsonPath("$.checkpoints[0].status").value("CLEARED"))
				.andExpect(jsonPath("$.checkpoints[0].verifiedCount").value(3))
				.andExpect(jsonPath("$.checkpoints[0].clearedAt").isNotEmpty())
				.andExpect(jsonPath("$.checkpoints[1].status").value("ACTIVE"));
		post(loginPro("Late"), "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isConflict());

		String feed = body(get(owner, "/api/v1/feed?scope=FRIENDS").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(feed, "$[*].type")).contains("CHECKPOINT_CLEARED", "CHECKPOINT_PROOF");
	}

	@Test
	void squadQuestProofIsVisibleToFriendsOnlyAndCompletesAfterThreeVerifies() throws Exception {
		Session owner = loginPro("SquadOwner");
		onboardLose(owner, 2, "WEIGH_IN");
		addFriends(owner, 3);
		String quest = body(post(owner, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""").andExpect(status().isOk()).andExpect(jsonPath("$.squadCheck").value(true)));
		String questId = JsonPath.read(quest, "$.id");

		String pending = body(post(owner, "/api/v1/quests/" + questId + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(jsonPath("$.requiredVerifications").value(3)));
		String proofId = JsonPath.read(pending, "$.proofId");

		Session stranger = loginPro("Stranger");
		post(stranger, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isForbidden());

		for (int i = 1; i <= 3; i++) {
			Session friend = loginPro("Squad" + i);
			joinByInvite(friend, owner);
			if (i == 1) {
				get(friend, "/api/v1/feed/pending-count").andExpect(jsonPath("$.count").value(1));
				String feed = body(get(friend, "/api/v1/feed").andExpect(status().isOk()));
				assertThat((List<String>) JsonPath.read(feed, "$[?(@.proofId=='" + proofId + "')].type")).containsExactly("QUEST_PROOF");
			}
			post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk());
		}

		String today = body(get(owner, "/api/v1/today").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(today, "$.quests[?(@.quest.id=='" + questId + "')].status")).containsExactly("DONE");
		assertThat((List<String>) JsonPath.read(today, "$.quests[?(@.quest.id=='" + questId + "')].summary"))
				.containsExactly("Friends verified");
	}
}
