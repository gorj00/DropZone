package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class ModerationIntegrationTest extends IntegrationTest {

	private Session friends(Session a, String name) throws Exception {
		Session b = loginPro(name);
		joinByInvite(b, a);
		return b;
	}

	private boolean stored(String url) {
		return storage.objects.containsKey(objectName(url));
	}

	private String report(String type, String id) {
		return "{\"targetType\":\"" + type + "\",\"targetId\":\"" + id + "\",\"reason\":\"bad\"}";
	}

	private String publish(Session owner, String before, String after) throws Exception {
		return body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","beforeCaption":"Day 1","afterCaption":"Day 90","visibility":"EVERYONE"}
				""".formatted(before, after)).andExpect(status().isOk()));
	}

	private int adminAlerts(Session admin, String column, String id) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = 'ADMIN_REPORT' and " + column + " = ?::uuid",
				Integer.class, admin.id(), id);
	}

	@Test
	void usersCanBeReportedResetAndSuspended() throws Exception {
		Session admin = admin();
		Session troll = loginPro("Troll");
		String avatar = uploadPhoto(troll);
		patch(troll, "/api/v1/me", "{\"bio\":\"rude bio\",\"avatarUrl\":\"" + avatar + "\"}").andExpect(status().isOk());
		Session friend = friends(troll, "TrollFriend");
		String item = JsonPath.read(publish(troll, photoUrl(troll), photoUrl(troll)), "$.feedItemId");

		post(troll, "/api/v1/reports", report("USER", troll.id().toString())).andExpect(status().isBadRequest());
		post(friend, "/api/v1/reports", report("USER", java.util.UUID.randomUUID().toString())).andExpect(status().isNotFound());
		post(friend, "/api/v1/reports", report("USER", troll.id().toString())).andExpect(status().isNoContent());
		get(friend, "/api/v1/admin/reports").andExpect(status().isForbidden());
		get(admin, "/api/v1/admin/reports").andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.targetId=='" + troll.id() + "')].targetType", hasItem("USER")))
				.andExpect(jsonPath("$[?(@.targetId=='" + troll.id() + "')].photoUrl", hasItem(avatar)));
		get(admin, "/api/v1/admin/users/" + troll.id()).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.bio").value("rude bio"))
				.andExpect(jsonPath("$.strikes").value(0))
				.andExpect(jsonPath("$.suspended").value(false))
				.andExpect(jsonPath("$.reports[0].targetType").value("USER"))
				.andExpect(jsonPath("$.reports[0].reporter.id").value(friend.id().toString()));
		get(admin, "/api/v1/admin/reports/USER/" + troll.id()).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.user.id").value(troll.id().toString()))
				.andExpect(jsonPath("$.reportCount").value(1));

		String reset = body(post(admin, "/api/v1/admin/users/" + troll.id() + "/reset-profile", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.displayName").value("DropZone user"))
				.andExpect(jsonPath("$.user.bio").doesNotExist())
				.andExpect(jsonPath("$.user.avatarUrl").doesNotExist()));
		assertThat((String) JsonPath.read(reset, "$.user.handle")).matches("user\\d{8}").isNotEqualTo(troll.handle());
		assertThat(stored(avatar)).isFalse();

		post(admin, "/api/v1/admin/users/" + admin.id() + "/suspend", null).andExpect(status().isBadRequest());
		post(admin, "/api/v1/admin/users/" + troll.id() + "/suspend", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.suspended").value(true));
		get(troll, "/api/v1/me").andExpect(status().isOk()).andExpect(jsonPath("$.suspended").value(true));
		get(troll, "/api/v1/today").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SUSPENDED"));
		patch(troll, "/api/v1/me", "{\"bio\":\"again\"}").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SUSPENDED"));
		post(troll, "/api/v1/feed/" + item + "/comments", "{\"body\":\"x\"}").andExpect(status().isForbidden());

		get(friend, "/api/v1/feed?scope=FRIENDS&limit=50").andExpect(jsonPath("$[*].id", not(hasItem(item))));
		get(friend, "/api/v1/feed/" + item).andExpect(status().isNotFound());
		get(friend, "/api/v1/social/friends").andExpect(jsonPath("$[*].id", not(hasItem(troll.id().toString()))));
		String handle = JsonPath.read(reset, "$.user.handle");
		get(friend, "/api/v1/social/search?q=" + handle).andExpect(jsonPath("$.length()").value(0));
		Session other = loginPro("TrollViewer");
		String otherItem = JsonPath.read(publish(other, photoUrl(other), photoUrl(other)), "$.feedItemId");
		post(friend, "/api/v1/feed/" + otherItem + "/comments", "{\"body\":\"nice\"}").andExpect(status().isOk());
		jdbc.update("insert into comments (id, feed_item_id, user_id, body, created_at) values (gen_random_uuid(), ?::uuid, ?, 'troll', now())",
				otherItem, troll.id());
		post(other, "/api/v1/social/requests", "{\"userId\":\"" + troll.id() + "\"}").andExpect(status().isNotFound());
		get(other, "/api/v1/feed/" + otherItem + "/comments").andExpect(jsonPath("$.length()").value(1));
		get(other, "/api/v1/feed/" + otherItem).andExpect(jsonPath("$.commentCount").value(1));

		post(admin, "/api/v1/admin/users/" + troll.id() + "/unsuspend", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.suspended").value(false));
		get(troll, "/api/v1/notifications").andExpect(status().isOk());
		get(friend, "/api/v1/feed/" + item).andExpect(status().isOk());
	}

	@Test
	void suspendedUsersCanStillDeleteTheirAccount() throws Exception {
		Session admin = admin();
		Session user = login("SuspendedLeaver");
		post(admin, "/api/v1/admin/users/" + user.id() + "/suspend", null).andExpect(status().isOk());
		post(user, "/api/v1/me/sign-out-everywhere", null).andExpect(status().isForbidden());
		delete(user, "/api/v1/me").andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, user.id())).isZero();
	}

	@Test
	void removalDeletesPhotosCountsStrikesAndBlocksRepublishing() throws Exception {
		Session admin = admin();
		Session owner = loginPro("RemovedOwner");
		String before = uploadPhoto(owner);
		String after = uploadPhoto(owner);
		String created = publish(owner, before, after);
		String setId = JsonPath.read(created, "$.id");
		String item = JsonPath.read(created, "$.feedItemId");

		post(admin, "/api/v1/admin/reports/POST/" + item + "/remove", null).andExpect(status().isNoContent());
		assertThat(stored(before)).isFalse();
		assertThat(stored(after)).isFalse();
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].visibility").value("PRIVATE"))
				.andExpect(jsonPath("$[0].removedByModerator").value(true));
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isConflict());
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isConflict());
		patch(owner, "/api/v1/transformations/" + setId, "{\"afterCaption\":\"edited\"}").andExpect(status().isOk());
		get(admin, "/api/v1/admin/users/" + owner.id()).andExpect(jsonPath("$.strikes").value(1));

		Session friend = friends(owner, "RemovedFriend");
		String other = JsonPath.read(publish(owner, photoUrl(owner), photoUrl(owner)), "$.feedItemId");
		String comment = JsonPath.read(body(post(friend, "/api/v1/feed/" + other + "/comments", "{\"body\":\"rude\"}")), "$.id");
		post(admin, "/api/v1/admin/reports/COMMENT/" + comment + "/remove", null).andExpect(status().isNoContent());
		get(admin, "/api/v1/admin/users/" + friend.id()).andExpect(jsonPath("$.strikes").value(1));
		get(owner, "/api/v1/feed/" + other + "/comments").andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void adminRemovalOfAPendingMilestoneProofRejectsItAndReopensTheMilestone() throws Exception {
		Session admin = admin();
		Session owner = loginPro("RejectedOwner");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		Session friend = friends(owner, "RejectedFriend");
		String photo = uploadPhoto(owner);
		String proofId = JsonPath.read(body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"" + photo + "\",\"value\":84.9}").andExpect(jsonPath("$.status").value("PENDING_VERIFICATION"))), "$.proofId");
		String item = JsonPath.read(body(get(owner, "/api/v1/proofs/" + proofId)), "$.post.id");
		long pending = count(friend);
		get(friend, "/api/v1/feed?scope=TO_VERIFY&limit=50").andExpect(jsonPath("$[*].proofId", hasItem(proofId)));

		post(admin, "/api/v1/admin/reports/POST/" + item + "/remove", null).andExpect(status().isNoContent());

		assertThat(count(friend)).isEqualTo(pending - 1);
		get(friend, "/api/v1/feed?scope=TO_VERIFY&limit=50").andExpect(jsonPath("$[*].proofId", not(hasItem(proofId))));
		post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isNotFound());
		get(friend, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("REMOVED"))
				.andExpect(jsonPath("$.status").value("REJECTED"));
		assertThat(stored(photo)).isFalse();
		get(owner, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].status").value("ACTIVE"))
				.andExpect(jsonPath("$.checkpoints[0].proofId").doesNotExist());
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("PROOF_REJECTED"))
				.andExpect(jsonPath("$[0].proofId").value(proofId));

		post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof", "{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":84.9}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING_VERIFICATION"));
		assertThat(count(friend)).isEqualTo(pending);
	}

	@Test
	void adminRemovalOfAPendingQuestProofPutsTheQuestBackToTodo() throws Exception {
		Session admin = admin();
		Session owner = loginPro("RejectedQuest");
		addFriends(owner, 3);
		onboardLose(owner, 2, "WEIGH_IN");
		String quest = JsonPath.read(body(post(owner, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""")), "$.id");
		String proofId = JsonPath.read(body(post(owner, "/api/v1/quests/" + quest + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(jsonPath("$.status").value("PENDING"))), "$.proofId");
		String item = JsonPath.read(body(get(owner, "/api/v1/proofs/" + proofId)), "$.post.id");

		post(admin, "/api/v1/admin/reports/POST/" + item + "/remove", null).andExpect(status().isNoContent());
		String today = body(get(owner, "/api/v1/today"));
		assertThat((List<String>) JsonPath.read(today, "$.quests[?(@.quest.id=='" + quest + "')].status")).containsExactly("TODO");
		post(owner, "/api/v1/quests/" + quest + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING"));
	}

	@Test
	void freshAccountsCannotHidePostsAndEditsMakeRestoredPostsHideableAgain() throws Exception {
		Session admin = admin();
		Session owner = loginPro("ShieldOwner");
		String created = publish(owner, photoUrl(owner), photoUrl(owner));
		String setId = JsonPath.read(created, "$.id");
		String item = JsonPath.read(created, "$.feedItemId");
		Session viewer = loginPro("ShieldViewer");

		for (int i = 0; i < 3; i++) {
			post(loginPro("Fresh" + i), "/api/v1/reports", report("POST", item)).andExpect(status().isNoContent());
		}
		get(viewer, "/api/v1/feed/" + item).andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(false));
		assertThat(adminAlerts(admin, "feed_item_id", item)).isEqualTo(1);

		for (int i = 0; i < 3; i++) {
			post(aged(loginPro("Aged" + i)), "/api/v1/reports", report("POST", item)).andExpect(status().isNoContent());
		}
		get(viewer, "/api/v1/feed/" + item).andExpect(status().isNotFound());
		assertThat(adminAlerts(admin, "feed_item_id", item)).isEqualTo(2);

		get(admin, "/api/v1/admin/reports/POST/" + item).andExpect(status().isOk())
				.andExpect(jsonPath("$.hidden").value(true))
				.andExpect(jsonPath("$.reportCount").value(6))
				.andExpect(jsonPath("$.post.photos.length()").value(2))
				.andExpect(jsonPath("$.post.transformation.beforeCaption").value("Day 1"));

		post(admin, "/api/v1/admin/reports/POST/" + item + "/restore", null).andExpect(status().isNoContent());
		for (int i = 0; i < 3; i++) {
			post(aged(loginPro("AfterRestore" + i)), "/api/v1/reports", report("POST", item)).andExpect(status().isNoContent());
		}
		get(viewer, "/api/v1/feed/" + item).andExpect(status().isOk());

		patch(owner, "/api/v1/transformations/" + setId, "{\"afterUrl\":\"" + photoUrl(owner) + "\"}").andExpect(status().isOk());
		post(aged(loginPro("AfterEdit")), "/api/v1/reports", report("POST", item)).andExpect(status().isNoContent());
		get(viewer, "/api/v1/feed/" + item).andExpect(status().isNotFound());
	}

	@Test
	void commentReportsNeedAVisibleCommentAndAdminsSeeTheCommentWithItsPost() throws Exception {
		Session admin = admin();
		Session owner = loginPro("CommentShield");
		Session friend = friends(owner, "CommentShieldFriend");
		String item = JsonPath.read(body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"FRIENDS"}
				""".formatted(photoUrl(owner), photoUrl(owner)))), "$.feedItemId");
		String comment = JsonPath.read(body(post(friend, "/api/v1/feed/" + item + "/comments", "{\"body\":\"secret\"}")), "$.id");

		post(aged(loginPro("Outsider")), "/api/v1/reports", report("COMMENT", comment)).andExpect(status().isNotFound());
		post(owner, "/api/v1/reports", report("COMMENT", comment)).andExpect(status().isNoContent());
		assertThat(adminAlerts(admin, "comment_id", comment)).isEqualTo(1);

		get(admin, "/api/v1/admin/reports/COMMENT/" + comment).andExpect(status().isOk())
				.andExpect(jsonPath("$.comment.body").value("secret"))
				.andExpect(jsonPath("$.post.id").value(item))
				.andExpect(jsonPath("$.reports[0].reporter.id").value(owner.id().toString()));
		get(admin, "/api/v1/admin/reports/POST/" + java.util.UUID.randomUUID()).andExpect(status().isNotFound());
		get(friend, "/api/v1/admin/reports/COMMENT/" + comment).andExpect(status().isForbidden());
	}

	private long count(Session session) throws Exception {
		return ((Number) JsonPath.read(body(get(session, "/api/v1/feed/pending-count").andExpect(status().isOk())), "$.count")).longValue();
	}
}
