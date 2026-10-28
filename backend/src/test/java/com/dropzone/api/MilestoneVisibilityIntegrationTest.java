package com.dropzone.api;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class MilestoneVisibilityIntegrationTest extends IntegrationTest {

	private String checkpoint(Session session, int index) throws Exception {
		return JsonPath.read(body(get(session, "/api/v1/goal").andExpect(status().isOk())), "$.checkpoints[" + index + "].id");
	}

	@Test
	void sharingIsProAndCommunityVerificationNeedsASharedMilestone() throws Exception {
		Session free = login("FreeVisibility");
		onboardLose(free, 2, "WEIGH_IN");
		String freeFirst = checkpoint(free, 0);
		get(free, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].visibility").value("PRIVATE"));
		patch(free, "/api/v1/checkpoints/" + freeFirst, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isPaymentRequired());
		patch(free, "/api/v1/checkpoints/" + freeFirst, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isPaymentRequired());

		Session pro = loginPro("ProVisibility");
		onboardLose(pro, 2, "WEIGH_IN");
		String first = checkpoint(pro, 0);
		patch(pro, "/api/v1/checkpoints/" + first, "{\"verification\":\"COMMUNITY\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("Community verification needs a milestone shared with friends or everyone"));
		patch(pro, "/api/v1/checkpoints/" + first, "{\"visibility\":\"FRIENDS\",\"verification\":\"COMMUNITY\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.visibility").value("FRIENDS"))
				.andExpect(jsonPath("$.isPublic").value(false))
				.andExpect(jsonPath("$.verification").value("COMMUNITY"));
		patch(pro, "/api/v1/checkpoints/" + first, "{\"visibility\":\"PRIVATE\",\"verification\":\"COMMUNITY\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.visibility").value("PRIVATE"))
				.andExpect(jsonPath("$.verification").value("AI"));
		patch(pro, "/api/v1/checkpoints/" + first, "{\"isPublic\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.visibility").value("EVERYONE"))
				.andExpect(jsonPath("$.isPublic").value(true));
		patch(pro, "/api/v1/checkpoints/" + first, "{\"isPublic\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.visibility").value("PRIVATE"));
		patch(pro, "/api/v1/checkpoints/" + first, "{\"visibility\":\"SECRET\"}").andExpect(status().isBadRequest());
	}

	@Test
	void friendsMilestonesAreSeenAndVerifiedByFriendsOnlyAndPrivateHidesThemAgain() throws Exception {
		Session owner = loginPro("FriendsMilestone");
		Session friend = loginPro("MilestoneBuddy");
		Session stranger = loginPro("MilestoneStranger2");
		befriend(owner, friend);
		onboardLose(owner, 2, "WEIGH_IN");
		onboardLose(friend, 2, "WEIGH_IN");
		String first = checkpoint(owner, 0);
		patch(owner, "/api/v1/checkpoints/" + first, "{\"visibility\":\"FRIENDS\",\"verification\":\"COMMUNITY\"}").andExpect(status().isOk());
		get(friend, "/api/v1/checkpoints/" + checkpoint(friend, 0) + "/social").andExpect(status().isOk())
				.andExpect(jsonPath("$.alsoChasing.count").value(1));

		String pending = body(post(owner, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":84.9}"
				.formatted(uploadPhoto(owner))).andExpect(jsonPath("$.status").value("PENDING_VERIFICATION")));
		String proofId = JsonPath.read(pending, "$.proofId");
		patch(owner, "/api/v1/checkpoints/" + first, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isConflict());
		get(friend, "/api/v1/feed?scope=TO_VERIFY").andExpect(jsonPath("$[*].proofId", hasItem(proofId)));
		get(stranger, "/api/v1/feed?scope=TO_VERIFY").andExpect(jsonPath("$[*].proofId", not(hasItem(proofId))));
		post(stranger, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isForbidden());
		post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isOk());
		jdbc.update("update proofs set created_at = now() - interval '49 hours' where id = ?::uuid", proofId);
		post(owner, "/api/v1/proofs/" + proofId + "/use-ai", null).andExpect(status().isOk());

		String cleared = body(get(friend, "/api/v1/feed?scope=FRIENDS&limit=50").andExpect(status().isOk()));
		java.util.List<String> types = JsonPath.read(cleared, "$[?(@.user.id=='" + owner.id() + "')].type");
		org.assertj.core.api.Assertions.assertThat(types).contains("CHECKPOINT_CLEARED", "CHECKPOINT_PROOF");
		String postId = ((java.util.List<String>) JsonPath.read(cleared, "$[?(@.type=='CHECKPOINT_CLEARED')].id")).getFirst();

		patch(owner, "/api/v1/checkpoints/" + first, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isOk());
		get(friend, "/api/v1/feed/" + postId).andExpect(status().isNotFound());
		get(friend, "/api/v1/feed?scope=FRIENDS&limit=50").andExpect(jsonPath("$[*].id", not(hasItem(postId))));
		get(friend, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.visible").value(false));
		get(owner, "/api/v1/feed/" + postId).andExpect(status().isOk());
	}

	@Test
	void settingsDefaultsApplyToMilestonesNotReachedYet() throws Exception {
		Session owner = loginPro("Defaults");
		onboardLose(owner, 3, "WEIGH_IN");
		post(owner, "/api/v1/checkpoints/" + checkpoint(owner, 0) + "/proof", "{\"photoUrl\":\"%s\",\"value\":86.6}"
				.formatted(uploadPhoto(owner))).andExpect(jsonPath("$.status").value("CLEARED"));
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(0));

		patch(owner, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(2));
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].visibility").value("PRIVATE"))
				.andExpect(jsonPath("$.checkpoints[1].visibility").value("EVERYONE"))
				.andExpect(jsonPath("$.checkpoints[1].verification").value("COMMUNITY"))
				.andExpect(jsonPath("$.checkpoints[2].visibility").value("EVERYONE"));
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(jsonPath("$.count").value(0));

		patch(owner, "/api/v1/me", "{\"publicByDefault\":false}").andExpect(status().isOk());
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(jsonPath("$.count").value(2));
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[2].visibility").value("FRIENDS"))
				.andExpect(jsonPath("$.checkpoints[2].verification").value("COMMUNITY"));

		endTrialAndSubscription(owner);
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(status().isPaymentRequired());
		patch(owner, "/api/v1/me", "{\"defaultVerification\":\"AI\"}").andExpect(status().isOk());
		post(owner, "/api/v1/goal/apply-defaults", null).andExpect(status().isOk()).andExpect(jsonPath("$.count").value(2));
	}

	private void endTrialAndSubscription(Session session) {
		jdbc.update("update users set pro = false, trial_ends_at = now() - interval '1 day' where id = ?", session.id());
	}
}
