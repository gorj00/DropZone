package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class MilestoneRulesIntegrationTest extends IntegrationTest {

	private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

	private static String goal(double start, double goal, int checkpoints) {
		return """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":%s,"goalValue":%s,"checkpoints":%d,
				 "questCodes":["WEIGH_IN"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""".formatted(start, goal, checkpoints);
	}

	private String proof(Session session, double value) {
		return "{\"photoUrl\":\"" + photoUrl(session) + "\",\"value\":" + value + "}";
	}

	@Test
	void tinyGoalsGetSpacedMilestones() throws Exception {
		Session user = login("TinyGoal");
		post(user, "/api/v1/onboarding", goal(80, 79.7, 2)).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("goalValue must be at least 0.4 kg away from startValue"));
		String onboarding = body(post(user, "/api/v1/onboarding", goal(80, 79.5, 10)).andExpect(status().isOk()));
		assertThat((List<Double>) JsonPath.read(onboarding, "$.goal.checkpoints[*].targetValue")).containsExactly(79.8, 79.5);

		Session editor = login("TinyEdit");
		onboardLose(editor, 10, "WEIGH_IN");
		patch(editor, "/api/v1/goal", "{\"goalValue\":89}").andExpect(status().isBadRequest());
		String edited = body(patch(editor, "/api/v1/goal", "{\"goalValue\":88}").andExpect(status().isOk()));
		List<Double> targets = JsonPath.read(edited, "$.checkpoints[*].targetValue");
		assertThat(targets).hasSize(10).startsWith(89.8).endsWith(88.0).doesNotHaveDuplicates().doesNotContain(90.0);
		String second = JsonPath.read(edited, "$.checkpoints[1].id");
		patch(editor, "/api/v1/checkpoints/" + second, "{\"targetValue\":89.7}").andExpect(status().isBadRequest());
	}

	@Test
	void parallelProofPostsClearTheMilestoneOnce() throws Exception {
		Session user = login("DoubleProof");
		String onboarding = onboardLose(user, 2, "WEIGH_IN");
		String checkpoint = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		List<Integer> statuses = parallel(2, i -> post(user, "/api/v1/checkpoints/" + checkpoint + "/proof", proof(user, 84.9)));
		assertThat(statuses).containsExactly(200, 409);
		assertThat(jdbc.queryForObject("select count(*) from proofs where ref_id = ?::uuid", Integer.class, checkpoint)).isEqualTo(1);
	}

	@Test
	void privateAgainHidesTheMilestonePostsAndAiPostsShowTheRewardPhoto() throws Exception {
		Session owner = loginPro("PublicMilestone");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		String onboarding = onboardLose(owner, 2, "WEIGH_IN");
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		String reward = photoUrl(owner);
		patch(owner, "/api/v1/checkpoints/" + first, "{\"rewardImageUrl\":\"" + reward + "\"}").andExpect(status().isOk());

		String scale = photoUrl(owner);
		String cleared = body(post(owner, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"" + scale + "\",\"value\":84.9}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLEARED")));
		String proofId = JsonPath.read(cleared, "$.proofId");
		Session stranger = loginPro("MilestoneStranger");
		String view = body(get(stranger, "/api/v1/proofs/" + proofId).andExpect(status().isOk())
				.andExpect(jsonPath("$.visible").value(true))
				.andExpect(jsonPath("$.post.type").value("CHECKPOINT_CLEARED"))
				.andExpect(jsonPath("$.post.photoUrl").value(signed(reward))));
		String itemId = JsonPath.read(view, "$.post.id");
		get(stranger, "/api/v1/feed?scope=EVERYONE&limit=50").andExpect(jsonPath("$[*].id", hasItem(itemId)));

		patch(owner, "/api/v1/checkpoints/" + first, "{\"isPublic\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.isPublic").value(false));
		get(stranger, "/api/v1/feed?scope=EVERYONE&limit=50").andExpect(jsonPath("$[*].id", not(hasItem(itemId))));
		get(stranger, "/api/v1/feed/" + itemId).andExpect(status().isNotFound());
		get(stranger, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.visible").value(false));

		patch(owner, "/api/v1/checkpoints/" + first, "{\"isPublic\":true}").andExpect(status().isOk());
		get(stranger, "/api/v1/feed/" + itemId).andExpect(status().isOk());

		Session friend = loginPro("MilestoneFriend");
		joinByInvite(friend, owner);
		patch(owner, "/api/v1/checkpoints/" + second, "{\"isPublic\":false}").andExpect(status().isOk());
		String privateClear = body(post(owner, "/api/v1/checkpoints/" + second + "/proof", proof(owner, 79.9)).andExpect(status().isOk()));
		get(friend, "/api/v1/proofs/" + JsonPath.read(privateClear, "$.proofId")).andExpect(status().isOk())
				.andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("REMOVED"))
				.andExpect(jsonPath("$.post").doesNotExist());
	}

	@Test
	void pendingCommunityProofKeepsTodaysWeighIn() throws Exception {
		Session owner = loginPro("KeepWeighIn");
		patch(owner, "/api/v1/me", "{\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String morning = photoUrl(owner);
		post(owner, "/api/v1/weigh-ins", "{\"value\":88,\"photoUrl\":\"" + morning + "\"}").andExpect(status().isOk());
		post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof", proof(owner, 84.9)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_VERIFICATION"));
		assertThat(jdbc.queryForMap("select value, photo_url from weigh_ins where user_id = ? and day = ?", owner.id(), today))
				.containsEntry("value", 88.0).containsEntry("photo_url", morning);
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(88.0));
	}

	@Test
	void lapsedOwnerClearsCommunityMilestonesWithAiAndGetsCommunityBack() throws Exception {
		Session owner = loginPro("LapsedCommunity");
		patch(owner, "/api/v1/me", "{\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String onboarding = onboardLose(owner, 2, "WEIGH_IN");
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		jdbc.update("update users set pro = false where id = ?", owner.id());

		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].verification").value("AI"))
				.andExpect(jsonPath("$.checkpoints[0].requiredVerifications").value(0));
		patch(owner, "/api/v1/checkpoints/" + second, "{\"verification\":\"AI\",\"rewardTitle\":\"Shoes\"}").andExpect(status().isOk());
		patch(owner, "/api/v1/checkpoints/" + second, "{\"verification\":\"COMMUNITY\"}").andExpect(status().isPaymentRequired());
		post(owner, "/api/v1/checkpoints/" + first + "/proof", proof(owner, 84.9)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED"))
				.andExpect(jsonPath("$.verification").value("AI"));

		makePro(owner);
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].verification").value("AI"))
				.andExpect(jsonPath("$.checkpoints[1].verification").value("COMMUNITY"))
				.andExpect(jsonPath("$.checkpoints[1].requiredVerifications").value(3));
	}

	@Test
	void unsplashCreditIsStoredWithTheRewardPhoto() throws Exception {
		Session user = login("Credit");
		String checkpoint = JsonPath.read(onboardLose(user, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String url = "/api/v1/checkpoints/" + checkpoint;
		String credit = "{\"name\":\"Ann Lens\",\"link\":\"https://unsplash.com/@ann\"}";
		patch(user, url, "{\"rewardImageUrl\":\"https://images.unsplash.com/photo-1\",\"rewardImageCredit\":" + credit + "}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rewardImageCredit.name").value("Ann Lens"))
				.andExpect(jsonPath("$.rewardImageCredit.link").value("https://unsplash.com/@ann"));
		get(user, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].rewardImageCredit.name").value("Ann Lens"));
		patch(user, url, "{\"rewardTitle\":\"Trip\"}").andExpect(jsonPath("$.rewardImageCredit.name").value("Ann Lens"));
		patch(user, url, "{\"rewardImageCredit\":{\"name\":\"X\",\"link\":\"https://evil.test/@x\"}}").andExpect(status().isBadRequest());

		patch(user, url, "{\"rewardImageUrl\":\"" + photoUrl(user) + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.rewardImageCredit").doesNotExist());
		patch(user, url, "{\"rewardImageCredit\":" + credit + "}").andExpect(status().isBadRequest());

		patch(user, url, "{\"rewardImageUrl\":\"https://images.unsplash.com/photo-2\",\"rewardImageCredit\":" + credit + "}")
				.andExpect(jsonPath("$.rewardImageCredit.name").value("Ann Lens"));
		patch(user, url, "{\"rewardImageUrl\":null}").andExpect(status().isOk())
				.andExpect(jsonPath("$.rewardImageUrl").doesNotExist())
				.andExpect(jsonPath("$.rewardImageCredit").doesNotExist());
	}

	@Test
	void wrongWeighInsCanBeDeletedAndTheGoalFollows() throws Exception {
		Session user = loginPro("DeleteWeighIn");
		onboardLose(user, 2, "WEIGH_IN");
		post(user, "/api/v1/weigh-ins", "{\"date\":\"%s\",\"value\":89}".formatted(today.minusDays(1))).andExpect(status().isOk());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(90.0));
		post(user, "/api/v1/weigh-ins", "{\"value\":31}").andExpect(status().isOk());
		post(user, "/api/v1/weigh-ins", "{\"value\":30}").andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select count(*) from measurements where user_id = ? and metric = 'WEIGHT' and day = ?", Integer.class,
				user.id(), today)).isEqualTo(1);
		get(user, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(30.0));

		delete(user, "/api/v1/weigh-ins/" + today).andExpect(status().isNoContent());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(89.0));
		get(user, "/api/v1/goal/history").andExpect(jsonPath("$.points[*].value", not(hasItem(30.0))));
		delete(user, "/api/v1/weigh-ins/" + today).andExpect(status().isNotFound());
		Session other = login("OtherDeleter");
		delete(other, "/api/v1/weigh-ins/" + today.minusDays(1)).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from weigh_ins where user_id = ?", Integer.class, user.id())).isEqualTo(1);
	}

	@Test
	void wrongLiftsCanBeDeletedAndTheBestLiftIsRecomputed() throws Exception {
		Session lifter = login("DeleteLift");
		post(lifter, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"STRENGTH","metricLabel":"Bench press","unit":"kg","startValue":60,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":62.5}").andExpect(status().isOk());
		post(lifter, "/api/v1/goal/progress", "{\"value\":450}").andExpect(status().isOk()).andExpect(jsonPath("$.currentValue").value(450.0));
		String list = body(get(lifter, "/api/v1/measurements").andExpect(status().isOk()));
		assertThat((List<Double>) JsonPath.read(list, "$[*].value")).containsExactly(450.0, 62.5, 60.0);
		String typo = ((List<String>) JsonPath.read(list, "$[?(@.value==450.0)].id")).getFirst();

		Session other = login("OtherLifter");
		delete(other, "/api/v1/measurements/" + typo).andExpect(status().isNotFound());
		delete(lifter, "/api/v1/measurements/" + typo).andExpect(status().isNoContent());
		get(lifter, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(62.5));
		get(lifter, "/api/v1/measurements").andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void parallelVerifiesCountEveryVoteAndCompleteOnce() throws Exception {
		Session owner = loginPro("VoteOwner");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String proofId = JsonPath.read(body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof", proof(owner, 84.9))
				.andExpect(status().isOk())), "$.proofId");
		List<Session> verifiers = new ArrayList<>();
		for (int i = 0; i < 4; i++) {
			verifiers.add(loginPro("Voter" + i));
		}
		List<Integer> statuses = parallel(4, i -> post(verifiers.get(i), "/api/v1/proofs/" + proofId + "/verify", null));
		assertThat(statuses).containsExactly(200, 200, 200, 409);
		assertThat(jdbc.queryForMap("select verified_count, status from proofs where id = ?::uuid", proofId))
				.containsEntry("verified_count", 3).containsEntry("status", "VERIFIED");
		assertThat(jdbc.queryForObject("select status from checkpoints where id = ?::uuid", String.class, checkpoint)).isEqualTo("CLEARED");
		assertThat(jdbc.queryForObject("select count(*) from feed_items where checkpoint_id = ?::uuid and type = 'CHECKPOINT_CLEARED'",
				Integer.class, checkpoint)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from notifications where proof_id = ?::uuid and type = 'PROOF_VERIFIED'",
				Integer.class, proofId)).isEqualTo(1);
	}
}
