package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PendingProofsIntegrationTest extends IntegrationTest {

	private static final String TOO_FEW = "You need at least 3 friends for Friends check, or choose Everyone";

	@Test
	void friendsCheckNeedsThreeFriendsUnlessEveryoneChecks() throws Exception {
		Session user = loginPro("FewFriends");
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = userQuestId(user, "HEALTHY_MEAL");
		addFriends(user, 2);
		patch(user, "/api/v1/quests/" + meal, "{\"squadCheck\":true}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value(TOO_FEW));
		post(user, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(TOO_FEW));
		patch(user, "/api/v1/quests/" + meal, "{\"squadCheck\":true,\"checkAudience\":\"EVERYONE\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.checkAudience").value("EVERYONE"));
		patch(user, "/api/v1/quests/" + meal, "{\"checkAudience\":\"FRIENDS\"}").andExpect(status().isBadRequest());
		addFriends(user, 1);
		patch(user, "/api/v1/quests/" + meal, "{\"checkAudience\":\"FRIENDS\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.checkAudience").value("FRIENDS"));
		post(user, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""").andExpect(status().isOk()).andExpect(jsonPath("$.checkAudience").value("FRIENDS"));
	}

	@Test
	void pendingFriendsCheckUnlocksTodayButCountsForTheStreakOnlyOnceVerified() throws Exception {
		Session owner = loginPro("PendingUnlock");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		onboardLose(owner, 2, "HEALTHY_MEAL");
		addFriends(owner, 3);
		String meal = userQuestId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"perDay\":1,\"squadCheck\":true}").andExpect(status().isOk());
		String pending = body(post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\"}".formatted(uploadPhoto(owner)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING")));
		String proofId = JsonPath.read(pending, "$.proofId");

		get(owner, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true))
				.andExpect(jsonPath("$.doneCount").value(0))
				.andExpect(jsonPath("$.totalCount").value(1))
				.andExpect(jsonPath("$.streak").value(0));
		assertThat(jdbc.queryForObject("select is_public from proofs where id = ?::uuid", Boolean.class, proofId)).isFalse();
		Session stranger = loginPro("PendingStranger");
		get(stranger, "/api/v1/feed?scope=EVERYONE&limit=50").andExpect(jsonPath("$[*].proofId", not(hasItem(proofId))));
	}

	@Test
	void ownersWithdrawPendingProofsAndResubmitTheSamePhoto() throws Exception {
		Session owner = loginPro("Withdrawer");
		Session friend = loginPro("WithdrawFriend");
		befriend(owner, friend);
		addFriends(owner, 2);
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = userQuestId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"perDay\":1,\"squadCheck\":true}").andExpect(status().isOk());
		String photo = uploadPhoto(owner);
		String pending = body(post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\"}".formatted(photo))
				.andExpect(status().isOk()));
		String proofId = JsonPath.read(pending, "$.proofId");
		post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk());

		post(friend, "/api/v1/proofs/" + proofId + "/withdraw", null).andExpect(status().isNotFound());
		post(owner, "/api/v1/proofs/" + proofId + "/withdraw", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("WITHDRAWN"));
		post(owner, "/api/v1/proofs/" + proofId + "/withdraw", null).andExpect(status().isConflict());
		post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from feed_items where proof_id = ?::uuid", Integer.class, proofId)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from notifications where proof_id = ?::uuid and user_id = ? and type = 'PROOF_REJECTED'",
				Integer.class, proofId, owner.id())).isZero();
		get(owner, "/api/v1/today").andExpect(jsonPath("$.quests[?(@.quest.code=='HEALTHY_MEAL')].status", hasItem("TODO")))
				.andExpect(jsonPath("$.unlocked").value(false));

		post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\"}".formatted(photo)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING"));

		patch(owner, "/api/v1/me", "{\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(status().isOk());
		String checkpoint = JsonPath.read(body(get(owner, "/api/v1/goal")), "$.checkpoints[0].id");
		String milestone = body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"%s\",\"value\":84.9}".formatted(uploadPhoto(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_VERIFICATION")));
		post(owner, "/api/v1/proofs/" + JsonPath.read(milestone, "$.proofId") + "/withdraw", null).andExpect(status().isOk());
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].status").value("ACTIVE"))
				.andExpect(jsonPath("$.checkpoints[0].proofId").doesNotExist());
	}

	@Test
	void ownersSwitchToTheAiCheckOnceTheProofIsTwoDaysOld() throws Exception {
		Session owner = loginPro("AiFallback");
		patch(owner, "/api/v1/me", "{\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		addFriends(owner, 3);
		String meal = userQuestId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"perDay\":1,\"squadCheck\":true}").andExpect(status().isOk());
		String pending = body(post(owner, "/api/v1/quests/" + meal + "/complete",
				"{\"photoUrl\":\"%s\",\"mlLabels\":[\"Food\"]}".formatted(uploadPhoto(owner))).andExpect(status().isOk()));
		String proofId = JsonPath.read(pending, "$.proofId");

		String view = body(get(owner, "/api/v1/proofs/" + proofId).andExpect(status().isOk()));
		Instant from = Instant.parse(JsonPath.read(view, "$.useAiFrom"));
		assertThat(from).isAfter(Instant.now().plusSeconds(47 * 3600));
		post(owner, "/api/v1/proofs/" + proofId + "/use-ai", null).andExpect(status().isConflict());
		Session other = loginPro("NotTheOwner");
		post(other, "/api/v1/proofs/" + proofId + "/use-ai", null).andExpect(status().isNotFound());

		jdbc.update("update proofs set created_at = now() - interval '49 hours' where id = ?::uuid", proofId);
		post(owner, "/api/v1/proofs/" + proofId + "/use-ai", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("VERIFIED"))
				.andExpect(jsonPath("$.useAiFrom").doesNotExist());
		get(owner, "/api/v1/today").andExpect(jsonPath("$.quests[?(@.quest.code=='HEALTHY_MEAL')].status", hasItem("DONE")))
				.andExpect(jsonPath("$.quests[?(@.quest.code=='HEALTHY_MEAL')].summary", hasItem("AI-checked after no verification")));
		post(owner, "/api/v1/proofs/" + proofId + "/use-ai", null).andExpect(status().isConflict());

		String checkpoint = JsonPath.read(body(get(owner, "/api/v1/goal")), "$.checkpoints[0].id");
		String milestone = body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"%s\",\"value\":84.9}".formatted(uploadPhoto(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_VERIFICATION")));
		String milestoneProof = JsonPath.read(milestone, "$.proofId");
		jdbc.update("update proofs set created_at = now() - interval '49 hours' where id = ?::uuid", milestoneProof);
		post(owner, "/api/v1/proofs/" + milestoneProof + "/use-ai", null).andExpect(status().isOk());
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].status").value("CLEARED"))
				.andExpect(jsonPath("$.checkpoints[0].verification").value("AI"))
				.andExpect(jsonPath("$.checkpoints[1].status").value("ACTIVE"));
	}
}
