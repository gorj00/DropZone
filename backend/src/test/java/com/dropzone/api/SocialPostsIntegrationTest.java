package com.dropzone.api;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class SocialPostsIntegrationTest extends IntegrationTest {

	private static final String SET = """
			{"beforeUrl":"%s","afterUrl":"%s",
			 "beforeCaption":"Day 1","afterCaption":"Day 90","layout":"SLIDESHOW","visibility":"%s"}
			""";

	private Session friends(Session a, String name) throws Exception {
		Session b = loginPro(name);
		joinByInvite(b, a);
		return b;
	}

	private String publish(Session owner, String visibility) throws Exception {
		return body(post(owner, "/api/v1/transformations", SET.formatted(photoUrl(owner), photoUrl(owner), visibility)).andExpect(status().isOk()));
	}

	@Test
	void privateSetsAreFreeAndPublishingNeedsPro() throws Exception {
		Session free = login("FreeSet");
		post(free, "/api/v1/transformations", SET.formatted(photoUrl(free), photoUrl(free), "PRIVATE")).andExpect(status().isOk())
				.andExpect(jsonPath("$.visibility").value("PRIVATE"))
				.andExpect(jsonPath("$.feedItemId").doesNotExist());
		post(free, "/api/v1/transformations", SET.formatted(photoUrl(free), photoUrl(free), "FRIENDS")).andExpect(status().isPaymentRequired());
		get(free, "/api/v1/transformations").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	void transformationVisibilityControlsTheFeed() throws Exception {
		Session owner = loginPro("SetOwner");
		Session friend = friends(owner, "SetFriend");
		Session stranger = loginPro("SetStranger");

		String created = publish(owner, "FRIENDS");
		String setId = JsonPath.read(created, "$.id");
		String itemId = JsonPath.read(created, "$.feedItemId");

		get(friend, "/api/v1/feed?scope=FRIENDS").andExpect(jsonPath("$[*].id", hasItem(itemId)))
				.andExpect(jsonPath("$[?(@.id=='" + itemId + "')].transformation.layout", hasItem("SLIDESHOW")));
		get(stranger, "/api/v1/feed?scope=EVERYONE").andExpect(jsonPath("$[*].id", not(hasItem(itemId))));
		get(stranger, "/api/v1/feed/" + itemId).andExpect(status().isNotFound());

		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.feedItemId").value(itemId));
		get(stranger, "/api/v1/feed?scope=EVERYONE").andExpect(jsonPath("$[*].id", hasItem(itemId)));

		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"PRIVATE\"}").andExpect(status().isOk());
		get(friend, "/api/v1/feed?scope=FRIENDS").andExpect(jsonPath("$[*].id", not(hasItem(itemId))));

		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isOk());
		jdbc.update("update users set pro = false where id = ?", owner.id());
		get(stranger, "/api/v1/feed?scope=EVERYONE").andExpect(jsonPath("$[*].id", not(hasItem(itemId))));
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].visibility").value("EVERYONE"));

		delete(owner, "/api/v1/transformations/" + setId).andExpect(status().isNoContent());
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void commentsFollowPostVisibilityAndOnlyAuthorsDelete() throws Exception {
		Session owner = loginPro("CommentOwner");
		Session friend = friends(owner, "CommentFriend");
		Session free = login("CommentFree");
		String itemId = JsonPath.read(publish(owner, "EVERYONE"), "$.feedItemId");

		String comment = body(post(friend, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"  Huge progress!  \"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.body").value("Huge progress!"))
				.andExpect(jsonPath("$.mine").value(true)));
		String commentId = JsonPath.read(comment, "$.id");
		post(free, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"hi\"}").andExpect(status().isPaymentRequired());
		post(friend, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"   \"}").andExpect(status().isBadRequest());

		get(owner, "/api/v1/feed/" + itemId).andExpect(jsonPath("$.commentCount").value(1));
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].mine").value(false))
				.andExpect(jsonPath("$[0].user.handle").value(friend.handle()));

		get(friend, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].canDelete").value(true));
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].canDelete").value(true));
		Session other = loginPro("CommentOther");
		get(other, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].canDelete").value(false));
		delete(other, "/api/v1/comments/" + commentId).andExpect(status().isForbidden());
		delete(friend, "/api/v1/comments/" + commentId).andExpect(status().isNoContent());
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$.length()").value(0));

		String stranger = JsonPath.read(body(post(other, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"go away\"}")), "$.id");
		delete(owner, "/api/v1/comments/" + stranger).andExpect(status().isNoContent());
		get(other, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void notificationsTrackSocialEvents() throws Exception {
		Session owner = loginPro("NotifOwner");
		Session friend = friends(owner, "NotifFriend");
		String itemId = JsonPath.read(publish(owner, "FRIENDS"), "$.feedItemId");

		post(friend, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"Nice\"}").andExpect(status().isOk());
		post(friend, "/api/v1/feed/" + itemId + "/hype", null).andExpect(status().isOk());

		get(owner, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(3));
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("HYPE"))
				.andExpect(jsonPath("$[1].type").value("COMMENT"))
				.andExpect(jsonPath("$[1].text").value("Nice"))
				.andExpect(jsonPath("$[1].actor.handle").value(friend.handle()))
				.andExpect(jsonPath("$[2].type").value("FRIEND_REQUEST"));

		post(owner, "/api/v1/notifications/read", "{}").andExpect(status().isNoContent());
		get(owner, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));

		Session requester = loginPro("NotifRequester");
		post(requester, "/api/v1/social/requests", "{\"userId\":\"" + owner.id() + "\"}").andExpect(status().isOk());
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("FRIEND_REQUEST"))
				.andExpect(jsonPath("$[0].read").value(false));
	}

	@Test
	void threeReportsHideAPostUntilAnAdminRestoresIt() throws Exception {
		Session owner = loginPro("ReportOwner");
		String itemId = JsonPath.read(publish(owner, "EVERYONE"), "$.feedItemId");
		String report = "{\"targetType\":\"POST\",\"targetId\":\"" + itemId + "\",\"reason\":\"spam\"}";

		post(owner, "/api/v1/reports", report).andExpect(status().isBadRequest());
		Session viewer = loginPro("ReportViewer");
		for (int i = 0; i < 3; i++) {
			Session reporter = aged(loginPro("Reporter" + i));
			post(reporter, "/api/v1/reports", report).andExpect(status().isNoContent());
			post(reporter, "/api/v1/reports", report).andExpect(status().isNoContent());
		}
		get(viewer, "/api/v1/feed?scope=EVERYONE").andExpect(jsonPath("$[*].id", not(hasItem(itemId))));
		get(owner, "/api/v1/feed/" + itemId).andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(true));

		get(viewer, "/api/v1/admin/reports").andExpect(status().isForbidden());
		Session admin = admin();
		get(admin, "/api/v1/admin/reports").andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.targetId=='" + itemId + "')].reportCount", hasItem(3)));
		post(admin, "/api/v1/admin/reports/POST/" + itemId + "/restore", null).andExpect(status().isNoContent());
		get(viewer, "/api/v1/feed/" + itemId).andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(false));
		get(admin, "/api/v1/admin/reports").andExpect(jsonPath("$[*].targetId", not(hasItem(itemId))));
	}

	@Test
	void reportedCommentsHideAndAdminsCanRemovePosts() throws Exception {
		Session owner = loginPro("ModOwner");
		Session friend = friends(owner, "ModFriend");
		String itemId = JsonPath.read(publish(owner, "EVERYONE"), "$.feedItemId");
		String commentId = JsonPath.read(body(post(friend, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"rude\"}")), "$.id");
		for (int i = 0; i < 3; i++) {
			post(aged(loginPro("CommentReporter" + i)), "/api/v1/reports", "{\"targetType\":\"COMMENT\",\"targetId\":\"" + commentId + "\"}")
					.andExpect(status().isNoContent());
		}
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$.length()").value(0));
		get(friend, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$.length()").value(1));

		Session admin = admin();
		post(admin, "/api/v1/admin/reports/POST/" + itemId + "/remove", null).andExpect(status().isNoContent());
		get(friend, "/api/v1/feed/" + itemId).andExpect(status().isNotFound());
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].visibility").value("PRIVATE"));
	}

	@Test
	void blockingHidesPostsAndStopsComments() throws Exception {
		Session owner = loginPro("BlockOwner");
		Session other = friends(owner, "BlockOther");
		String ownerItem = JsonPath.read(publish(owner, "EVERYONE"), "$.feedItemId");
		String otherItem = JsonPath.read(publish(other, "EVERYONE"), "$.feedItemId");

		post(owner, "/api/v1/blocks/" + other.id(), null).andExpect(status().isNoContent());
		get(owner, "/api/v1/blocks").andExpect(jsonPath("$[0].handle").value(other.handle()));
		get(owner, "/api/v1/social/friends").andExpect(jsonPath("$.length()").value(0));
		get(owner, "/api/v1/feed?scope=EVERYONE").andExpect(jsonPath("$[*].id", not(hasItem(otherItem))));
		get(other, "/api/v1/feed/" + ownerItem).andExpect(status().isNotFound());
		post(other, "/api/v1/feed/" + ownerItem + "/comments", "{\"body\":\"hey\"}").andExpect(status().isNotFound());
		post(other, "/api/v1/social/requests", "{\"userId\":\"" + owner.id() + "\"}").andExpect(status().isNotFound());

		delete(owner, "/api/v1/blocks/" + other.id()).andExpect(status().isNoContent());
		get(other, "/api/v1/feed/" + ownerItem).andExpect(status().isOk());
	}
}
