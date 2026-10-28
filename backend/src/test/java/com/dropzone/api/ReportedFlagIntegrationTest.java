package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class ReportedFlagIntegrationTest extends IntegrationTest {

	private static final String UNDER_REVIEW = "This post was reported and is under review. You can share it again once a moderator restores it.";
	private static final String REMOVED = "This post was removed by a moderator and can't be shared again";

	private void reportedThreeTimes(String postId) throws Exception {
		for (int i = 0; i < 3; i++) {
			Session reporter = aged(loginPro("Flagger" + i));
			post(reporter, "/api/v1/reports", "{\"targetType\":\"POST\",\"targetId\":\"" + postId + "\"}").andExpect(status().isNoContent());
		}
	}

	@Test
	void hiddenPostsShowUnderReviewToTheOwnerAndCantBeSharedAgainUntilRestored() throws Exception {
		Session owner = loginPro("ReportedOwner");
		Session friend = loginPro("ReportedFriend");
		befriend(owner, friend);
		String set = body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"EVERYONE"}
				""".formatted(uploadPhoto(owner), uploadPhoto(owner))).andExpect(status().isOk())
				.andExpect(jsonPath("$.moderation").doesNotExist()));
		String setId = JsonPath.read(set, "$.id");
		String postId = JsonPath.read(set, "$.feedItemId");
		reportedThreeTimes(postId);

		get(owner, "/api/v1/feed/" + postId).andExpect(jsonPath("$.hidden").value(true))
				.andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].moderation").value("UNDER_REVIEW"));
		get(friend, "/api/v1/feed/" + postId).andExpect(status().isNotFound());
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isOk());
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(UNDER_REVIEW));
		patch(owner, "/api/v1/feed/" + postId, "{\"isPublic\":true}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(UNDER_REVIEW));

		Session admin = admin();
		post(admin, "/api/v1/admin/reports/POST/" + postId + "/restore", null).andExpect(status().isNoContent());
		get(owner, "/api/v1/feed/" + postId).andExpect(jsonPath("$.moderation").doesNotExist());
		patch(owner, "/api/v1/feed/" + postId, "{\"isPublic\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.isPublic").value(true));
		get(friend, "/api/v1/feed/" + postId).andExpect(status().isOk()).andExpect(jsonPath("$.moderation").doesNotExist());
	}

	@Test
	void removedMilestonePostsFlagTheMilestoneAndTheProof() throws Exception {
		Session owner = loginPro("RemovedMilestone");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String proofId = JsonPath.read(body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"%s\",\"value\":84.9}".formatted(uploadPhoto(owner))).andExpect(jsonPath("$.status").value("CLEARED"))), "$.proofId");
		String postId = JsonPath.read(body(get(owner, "/api/v1/proofs/" + proofId)), "$.post.id");
		reportedThreeTimes(postId);
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].moderation").value("UNDER_REVIEW"));
		get(owner, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		patch(owner, "/api/v1/checkpoints/" + checkpoint, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isOk());
		patch(owner, "/api/v1/checkpoints/" + checkpoint, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(UNDER_REVIEW));

		Session admin = admin();
		post(admin, "/api/v1/admin/reports/POST/" + postId + "/remove", null).andExpect(status().isNoContent());
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].moderation").value("REMOVED"))
				.andExpect(jsonPath("$.checkpoints[0].status").value("CLEARED"));
		get(owner, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.moderation").value("REMOVED"));
		patch(owner, "/api/v1/checkpoints/" + checkpoint, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(REMOVED));
		patch(owner, "/api/v1/checkpoints/" + checkpoint, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isOk());
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[1].moderation").doesNotExist());
	}

	@Test
	void removedSetsAreFlaggedForTheirOwner() throws Exception {
		Session owner = loginPro("RemovedSet");
		String set = body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"FRIENDS"}
				""".formatted(uploadPhoto(owner), uploadPhoto(owner))).andExpect(status().isOk()));
		post(admin(), "/api/v1/admin/reports/POST/" + JsonPath.read(set, "$.feedItemId") + "/remove", null).andExpect(status().isNoContent());
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].moderation").value("REMOVED"))
				.andExpect(jsonPath("$[0].removedByModerator").value(true));
		patch(owner, "/api/v1/transformations/" + JsonPath.read(set, "$.id"), "{\"visibility\":\"FRIENDS\"}").andExpect(status().isConflict())
				.andExpect(jsonPath("$.message").value(REMOVED));
	}
}
