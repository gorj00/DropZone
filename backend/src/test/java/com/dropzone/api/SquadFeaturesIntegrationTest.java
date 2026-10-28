package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class SquadFeaturesIntegrationTest extends IntegrationTest {

	@Test
	void catalogQuestCanBeSquadCheckedByProOnly() throws Exception {
		Session free = login("FreeSquad");
		onboardLose(free, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String freeMeal = questId(free, "HEALTHY_MEAL");
		patch(free, "/api/v1/quests/" + freeMeal, "{\"squadCheck\":true}").andExpect(status().isPaymentRequired());

		Session owner = loginPro("CatalogSquad");
		addFriends(owner, 3);
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = questId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"squadCheck\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.squadCheck").value(true))
				.andExpect(jsonPath("$.code").value("HEALTHY_MEAL"));
		patch(owner, "/api/v1/quests/" + java.util.UUID.randomUUID(), "{\"squadCheck\":true}").andExpect(status().isNotFound());

		post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(jsonPath("$.requiredVerifications").value(3));

		put(owner, "/api/v1/quests", "{\"codes\":[\"WEIGH_IN\",\"HEALTHY_MEAL\"]}").andExpect(status().isOk());
		String list = body(get(owner, "/api/v1/quests").andExpect(status().isOk()));
		assertThat((List<Boolean>) JsonPath.read(list, "$[?(@.code=='HEALTHY_MEAL')].squadCheck")).containsExactly(true);

		patch(owner, "/api/v1/quests/" + meal, "{\"squadCheck\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.squadCheck").value(false));
	}

	@Test
	void strengthGoalProgressKeepsBestLift() throws Exception {
		Session lifter = login("Lifter");
		post(lifter, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"STRENGTH","metricLabel":"Bench press","unit":"kg","startValue":60,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN","GYM"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":65}").andExpect(status().isOk())
				.andExpect(jsonPath("$.currentValue").value(65.0))
				.andExpect(jsonPath("$.progressValue").value(5.0))
				.andExpect(jsonPath("$.checkpoints[0].status").value("ACTIVE"));
		post(lifter, "/api/v1/goal/progress", "{\"value\":62.5}").andExpect(status().isOk())
				.andExpect(jsonPath("$.currentValue").value(65.0));
		post(lifter, "/api/v1/goal/progress", "{\"value\":-1}").andExpect(status().isBadRequest());

		Session dropper = login("Dropper");
		onboardLose(dropper, 2, "WEIGH_IN");
		post(dropper, "/api/v1/goal/progress", "{\"value\":85}").andExpect(status().isConflict());
	}

	@Test
	void proofLinkShowsPostToFriendsAndOwnerOnlyToStrangers() throws Exception {
		Session owner = loginPro("LinkOwner");
		addFriends(owner, 3);
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = questId(owner, "HEALTHY_MEAL");
		patch(owner, "/api/v1/quests/" + meal, "{\"squadCheck\":true}").andExpect(status().isOk());
		String photo = photoUrl(owner);
		String pending = body(post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photo + "\"}")
				.andExpect(status().isOk()));
		String proofId = JsonPath.read(pending, "$.proofId");

		get(owner, "/api/v1/proofs/" + proofId).andExpect(status().isOk())
				.andExpect(jsonPath("$.relation").value("SELF"))
				.andExpect(jsonPath("$.visible").value(true))
				.andExpect(jsonPath("$.post.photoUrl").value(signed(photo)))
				.andExpect(jsonPath("$.post.verification.canVerify").value(false));

		Session stranger = loginPro("LinkStranger");
		get(stranger, "/api/v1/proofs/" + proofId).andExpect(status().isOk())
				.andExpect(jsonPath("$.relation").value("NONE"))
				.andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.post").doesNotExist())
				.andExpect(jsonPath("$.owner.handle").value(owner.handle()));
		post(stranger, "/api/v1/social/requests", "{\"userId\":\"" + owner.id() + "\"}").andExpect(status().isOk());
		get(stranger, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.relation").value("REQUESTED"));
		get(owner, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.relation").value("SELF"));

		Session friend = loginPro("LinkFriend");
		joinByInvite(friend, owner);
		get(friend, "/api/v1/proofs/" + proofId).andExpect(status().isOk())
				.andExpect(jsonPath("$.relation").value("FRIEND"))
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(jsonPath("$.post.id").isNotEmpty())
				.andExpect(jsonPath("$.post.verification.canVerify").value(true));

		get(friend, "/api/v1/proofs/" + java.util.UUID.randomUUID()).andExpect(status().isNotFound());
		get(login("LinkFree"), "/api/v1/proofs/" + proofId).andExpect(status().isPaymentRequired());
	}

	@Test
	void customSlipUpTypesArePrivateAndProOnly() throws Exception {
		Session free = login("FreeSlips");
		post(free, "/api/v1/slip-ups/types", "{\"name\":\"Energy drink\",\"icon\":\"drop\"}").andExpect(status().isPaymentRequired());

		Session pro = loginPro("ProSlips");
		String created = body(post(pro, "/api/v1/slip-ups/types", "{\"name\":\"Energy drink\",\"icon\":\"drop\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.custom").value(true))
				.andExpect(jsonPath("$.name").value("Energy drink")));
		String code = JsonPath.read(created, "$.code");
		post(pro, "/api/v1/slip-ups/types", "{\"name\":\"energy drink\",\"icon\":\"drop\"}").andExpect(status().isConflict());

		String mine = body(get(pro, "/api/v1/slip-ups/types").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(mine, "$[*].code")).contains("LATE_SNACK", code);
		String theirs = body(get(free, "/api/v1/slip-ups/types").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(theirs, "$[*].code")).contains("LATE_SNACK").doesNotContain(code);

		post(pro, "/api/v1/slip-ups", "{\"type\":\"" + code + "\"}").andExpect(status().isOk());
		Session other = loginPro("OtherSlips");
		post(other, "/api/v1/slip-ups", "{\"type\":\"" + code + "\"}").andExpect(status().isBadRequest());
		delete(other, "/api/v1/slip-ups/types/" + code).andExpect(status().isNotFound());

		String stats = body(get(pro, "/api/v1/stats").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(stats, "$.topSlipUps[*].name")).contains("Energy drink");

		delete(pro, "/api/v1/slip-ups/types/" + code).andExpect(status().isNoContent());
		String after = body(get(pro, "/api/v1/slip-ups/types").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(after, "$[*].code")).doesNotContain(code);
		post(pro, "/api/v1/slip-ups", "{\"type\":\"" + code + "\"}").andExpect(status().isBadRequest());
	}

	@Test
	void checkpointSocialShowsHypersAndFriendsChasingSameCheckpoint() throws Exception {
		Session owner = loginPro("HypedOwner");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		String onboarding = onboardLose(owner, 2, "WEIGH_IN");
		String checkpoint = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");

		Session chaser = loginPro("Chaser");
		patch(chaser, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		onboardLose(chaser, 3, "WEIGH_IN");
		joinByInvite(chaser, owner);
		Session privateChaser = loginPro("PrivateChaser");
		onboardLose(privateChaser, 3, "WEIGH_IN");
		joinByInvite(privateChaser, owner);
		Session idle = loginPro("Idle");
		joinByInvite(idle, owner);
		Session builder = loginPro("Builder");
		post(builder, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"WEIGHT","unit":"kg","startValue":70,"goalValue":78,"checkpoints":2,
				 "questCodes":["WEIGH_IN","GYM"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		joinByInvite(builder, owner);

		get(owner, "/api/v1/checkpoints/" + checkpoint + "/social").andExpect(status().isOk())
				.andExpect(jsonPath("$.hypes.count").value(0))
				.andExpect(jsonPath("$.alsoChasing.count").value(1))
				.andExpect(jsonPath("$.alsoChasing.users[0].handle").value(chaser.handle()));

		String cleared = body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":84.9}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED")));
		String proofId = JsonPath.read(cleared, "$.proofId");
		String post = body(get(chaser, "/api/v1/proofs/" + proofId).andExpect(status().isOk()));
		String itemId = JsonPath.read(post, "$.post.id");
		post(chaser, "/api/v1/feed/" + itemId + "/hype", null).andExpect(status().isOk());
		post(idle, "/api/v1/feed/" + itemId + "/hype", null).andExpect(status().isOk());

		get(owner, "/api/v1/checkpoints/" + checkpoint + "/social").andExpect(status().isOk())
				.andExpect(jsonPath("$.hypes.count").value(2))
				.andExpect(jsonPath("$.hypes.users.length()").value(2));

		get(chaser, "/api/v1/checkpoints/" + checkpoint + "/social").andExpect(status().isNotFound());
		Session free = login("FreeSocial");
		onboardLose(free, 2, "WEIGH_IN");
		String freeCp = JsonPath.read(body(get(free, "/api/v1/goal")), "$.checkpoints[0].id");
		get(free, "/api/v1/checkpoints/" + freeCp + "/social").andExpect(status().isPaymentRequired());
	}

	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
