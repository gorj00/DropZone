package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.domain.User;
import com.dropzone.api.social.SocialService;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletResponse;

class FeedRulesIntegrationTest extends IntegrationTest {

	@Autowired
	private SocialService social;

	private Session friends(Session a, String name) throws Exception {
		Session b = loginPro(name);
		joinByInvite(b, a);
		return b;
	}

	private String squadQuest(Session owner) throws Exception {
		addFriends(owner, 3);
		return JsonPath.read(body(post(owner, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""").andExpect(status().isOk())), "$.id");
	}

	private String complete(Session owner, String quest, String extra) throws Exception {
		return JsonPath.read(body(post(owner, "/api/v1/quests/" + quest + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"" + extra + "}")
				.andExpect(status().isOk())), "$.proofId");
	}

	private String postOf(Session owner, String proofId) throws Exception {
		return JsonPath.read(body(get(owner, "/api/v1/proofs/" + proofId)), "$.post.id");
	}

	private String publicMilestoneProof(Session owner) throws Exception {
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		return JsonPath.read(body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":84.9}").andExpect(status().isOk())), "$.proofId");
	}

	private String transformation(Session owner, String visibility) throws Exception {
		return JsonPath.read(body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"%s"}
				""".formatted(photoUrl(owner), photoUrl(owner), visibility)).andExpect(status().isOk())), "$.feedItemId");
	}

	private int rows(String sql, Object... args) {
		return jdbc.queryForObject(sql, Integer.class, args);
	}

	@Test
	void authorsCanMakeTheirPostPrivateOrDeleteIt() throws Exception {
		Session owner = loginPro("PostAuthor");
		onboardLose(owner, 2, "WEIGH_IN");
		String quest = squadQuest(owner);
		Session friend = friends(owner, "PostFriend");
		Session stranger = loginPro("PostStranger");
		String proofId = complete(owner, quest, "");
		String item = postOf(owner, proofId);
		post(friend, "/api/v1/feed/" + item + "/comments", "{\"body\":\"nice\"}").andExpect(status().isOk());
		post(friend, "/api/v1/feed/" + item + "/hype", null).andExpect(status().isOk());

		patch(stranger, "/api/v1/feed/" + item, "{\"isPublic\":true}").andExpect(status().isNotFound());
		patch(friend, "/api/v1/feed/" + item, "{\"isPublic\":true}").andExpect(status().isForbidden());
		patch(owner, "/api/v1/feed/" + item, "{}").andExpect(status().isBadRequest());
		patch(owner, "/api/v1/feed/" + item, "{\"isPublic\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.isPublic").value(true));
		get(stranger, "/api/v1/feed/" + item).andExpect(status().isOk());
		assertThat(rows("select count(*) from proofs where id = ?::uuid and is_public", proofId)).isEqualTo(1);
		patch(owner, "/api/v1/feed/" + item, "{\"isPublic\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.isPublic").value(false));
		get(stranger, "/api/v1/feed/" + item).andExpect(status().isNotFound());
		post(stranger, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isForbidden());
		assertThat(rows("select count(*) from proofs where id = ?::uuid and is_public", proofId)).isZero();

		delete(friend, "/api/v1/feed/" + item).andExpect(status().isForbidden());
		delete(owner, "/api/v1/feed/" + item).andExpect(status().isNoContent());
		get(owner, "/api/v1/feed/" + item).andExpect(status().isNotFound());
		assertThat(rows("select count(*) from comments where feed_item_id = ?::uuid", item)).isZero();
		assertThat(rows("select count(*) from hypes where feed_item_id = ?::uuid", item)).isZero();
		assertThat(rows("select count(*) from notifications where feed_item_id = ?::uuid", item)).isZero();
		assertThat(jdbc.queryForObject("select status from proofs where id = ?::uuid", String.class, proofId)).isEqualTo("REJECTED");
		String today = body(get(owner, "/api/v1/today"));
		assertThat((List<String>) JsonPath.read(today, "$.quests[?(@.quest.id=='" + quest + "')].status")).containsExactly("TODO");
		get(friend, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.visible").value(false)).andExpect(jsonPath("$.reason").value("REMOVED"));
		post(friend, "/api/v1/proofs/" + proofId + "/verify", null).andExpect(status().isNotFound());
	}

	@Test
	void proofLinksShowOnlySharedPostsAndSayWhyNot() throws Exception {
		Session owner = loginPro("ProofLinkOwner");
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		Session friend = friends(owner, "ProofLinkFriend");
		Session stranger = loginPro("ProofLinkStranger");
		String meal = ((List<String>) JsonPath.read(body(get(owner, "/api/v1/quests")), "$[?(@.code=='HEALTHY_MEAL')].id")).getFirst();
		String privateProof = complete(owner, meal, ",\"mlLabels\":[\"Food\"]");

		get(friend, "/api/v1/proofs/" + privateProof).andExpect(status().isOk())
				.andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("REMOVED"))
				.andExpect(jsonPath("$.post").doesNotExist());
		get(owner, "/api/v1/proofs/" + privateProof).andExpect(jsonPath("$.visible").value(true))
				.andExpect(jsonPath("$.reason").doesNotExist())
				.andExpect(jsonPath("$.post.aiChecked").value(true));

		String pending = complete(owner, squadQuest(owner), "");
		String item = postOf(owner, pending);
		get(friend, "/api/v1/proofs/" + pending).andExpect(jsonPath("$.visible").value(true))
				.andExpect(jsonPath("$.post.aiChecked").value(false));
		get(stranger, "/api/v1/proofs/" + pending).andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("FRIENDS_ONLY"));
		get(friend, "/api/v1/feed?scope=TO_VERIFY&limit=50").andExpect(jsonPath("$[*].proofId", hasItem(pending)));
		long before = count(friend);

		jdbc.update("update feed_items set hidden = true where id = ?::uuid", item);
		get(friend, "/api/v1/proofs/" + pending).andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("UNDER_REVIEW"));
		assertThat(count(friend)).isEqualTo(before - 1);
		get(friend, "/api/v1/feed?scope=TO_VERIFY&limit=50").andExpect(jsonPath("$[*].proofId", not(hasItem(pending))));
		post(friend, "/api/v1/proofs/" + pending + "/verify", null).andExpect(status().isNotFound());
		get(owner, "/api/v1/proofs/" + pending).andExpect(jsonPath("$.visible").value(true)).andExpect(jsonPath("$.post.hidden").value(true));
	}

	@Test
	void toVerifyListsExactlyTheProofsTheViewerCanVerify() throws Exception {
		Session viewer = loginPro("Checker");
		onboardLose(viewer, 2, "WEIGH_IN");
		Session friend = loginPro("CheckerFriend");
		onboardLose(friend, 2, "WEIGH_IN");
		joinByInvite(friend, viewer);
		String friendProof = complete(friend, squadQuest(friend), "");
		String publicProof = publicMilestoneProof(loginPro("CheckerPublic"));
		String verifiedProof = publicMilestoneProof(loginPro("CheckerVerified"));
		Session blocked = loginPro("CheckerBlocked");
		String blockedProof = publicMilestoneProof(blocked);
		String ownProof = complete(viewer, squadQuest(viewer), "");
		post(viewer, "/api/v1/proofs/" + verifiedProof + "/verify", null).andExpect(status().isOk());
		post(viewer, "/api/v1/blocks/" + blocked.id(), null).andExpect(status().isNoContent());

		List<String> listed = new ArrayList<>();
		String cursor = null;
		do {
			MockHttpServletResponse response = get(viewer, "/api/v1/feed?scope=TO_VERIFY&limit=20"
					+ (cursor == null ? "" : "&cursor=" + cursor))
					.andExpect(status().isOk()).andReturn().getResponse();
			listed.addAll(JsonPath.read(response.getContentAsString(), "$[*].proofId"));
			assertThat((List<Boolean>) JsonPath.read(response.getContentAsString(), "$[*].verification.canVerify")).doesNotContain(false);
			cursor = response.getHeader("X-Next-Cursor");
		}
		while (cursor != null);

		assertThat(listed).contains(friendProof, publicProof).doesNotContain(verifiedProof, blockedProof, ownProof).doesNotHaveDuplicates();
		assertThat(count(viewer)).isEqualTo(listed.size());
	}

	@Test
	void hypeTogglesNotifyTheAuthorOnceAndParallelTapsDoNotFail() throws Exception {
		Session owner = loginPro("HypeOwner");
		Session friend = friends(owner, "HypeFriend");
		String item = transformation(owner, "FRIENDS");
		post(owner, "/api/v1/notifications/read", "{}").andExpect(status().isNoContent());

		for (int i = 0; i < 5; i++) {
			post(friend, "/api/v1/feed/" + item + "/hype", null).andExpect(status().isOk())
					.andExpect(jsonPath("$.hypedByMe").value(i % 2 == 0));
		}
		assertThat(rows("select count(*) from notifications where type = 'HYPE' and actor_id = ? and feed_item_id = ?::uuid", friend.id(), item))
				.isEqualTo(1);
		get(owner, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(1));
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("HYPE"));

		post(friend, "/api/v1/feed/" + item + "/hype", null).andExpect(jsonPath("$.hypedByMe").value(false));
		get(owner, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[*].type", not(hasItem("HYPE"))));

		List<Integer> statuses = parallel(2, i -> post(friend, "/api/v1/feed/" + item + "/hype", null));
		assertThat(statuses).containsExactly(200, 200);
		assertThat(rows("select count(*) from hypes where feed_item_id = ?::uuid", item)).isLessThanOrEqualTo(1);
		assertThat(rows("select count(*) from notifications where type = 'HYPE' and feed_item_id = ?::uuid", item)).isEqualTo(1);
	}

	@Test
	void blockedPeopleAreLeftOutOfCountsAndFaces() throws Exception {
		Session owner = loginPro("CountOwner");
		patch(owner, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		String checkpoint = JsonPath.read(onboardLose(owner, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String proofId = JsonPath.read(body(post(owner, "/api/v1/checkpoints/" + checkpoint + "/proof",
				"{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":84.9}").andExpect(status().isOk())), "$.proofId");
		String milestonePost = postOf(owner, proofId);
		Session other = friends(owner, "CountOther");
		String item = transformation(owner, "EVERYONE");
		post(other, "/api/v1/feed/" + item + "/comments", "{\"body\":\"hi\"}").andExpect(status().isOk());
		post(other, "/api/v1/feed/" + item + "/hype", null).andExpect(status().isOk());
		post(other, "/api/v1/feed/" + milestonePost + "/hype", null).andExpect(status().isOk());
		get(owner, "/api/v1/feed/" + item).andExpect(jsonPath("$.hypeCount").value(1)).andExpect(jsonPath("$.commentCount").value(1));
		get(owner, "/api/v1/checkpoints/" + checkpoint + "/social").andExpect(jsonPath("$.hypes.count").value(1));
		long unread = ((Number) JsonPath.read(body(get(owner, "/api/v1/notifications/unread-count")), "$.count")).longValue();

		post(owner, "/api/v1/blocks/" + other.id(), null).andExpect(status().isNoContent());
		get(owner, "/api/v1/feed/" + item).andExpect(jsonPath("$.hypeCount").value(0)).andExpect(jsonPath("$.commentCount").value(0));
		get(owner, "/api/v1/transformations").andExpect(jsonPath("$[0].hypeCount").value(0)).andExpect(jsonPath("$[0].commentCount").value(0));
		get(owner, "/api/v1/checkpoints/" + checkpoint + "/social").andExpect(jsonPath("$.hypes.count").value(0));
		get(owner, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(unread - 4));
		get(owner, "/api/v1/notifications").andExpect(jsonPath("$[*].actor.id", not(hasItem(other.id().toString()))));
	}

	@Test
	void cancelledDeclinedOrBlockedRequestsLoseTheirNotification() throws Exception {
		Session target = loginPro("RequestTarget");
		Session sender = loginPro("RequestSender");
		String request = "{\"userId\":\"" + target.id() + "\"}";
		String sql = "select count(*) from notifications where type = 'FRIEND_REQUEST' and actor_id = ? and user_id = ?";

		String first = JsonPath.read(body(post(sender, "/api/v1/social/requests", request).andExpect(status().isOk())), "$.id");
		get(target, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(1));
		delete(sender, "/api/v1/social/requests/" + first).andExpect(status().isNoContent());
		get(target, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));
		assertThat(rows(sql, sender.id(), target.id())).isZero();

		String second = JsonPath.read(body(post(sender, "/api/v1/social/requests", request).andExpect(status().isOk())), "$.id");
		delete(target, "/api/v1/social/requests/" + second).andExpect(status().isNoContent());
		assertThat(rows(sql, sender.id(), target.id())).isZero();

		post(sender, "/api/v1/social/requests", request).andExpect(status().isOk());
		post(target, "/api/v1/blocks/" + sender.id(), null).andExpect(status().isNoContent());
		assertThat(rows(sql, sender.id(), target.id())).isZero();
	}

	@Test
	void feedAndNotificationPagesStayFullUntilTheRealEnd() throws Exception {
		Session viewer = loginPro("Pager");
		Session shown = friends(viewer, "PagerShown");
		Session lapsed = friends(viewer, "PagerLapsed");
		List<String> expected = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			expected.add(transformation(shown, "FRIENDS"));
			transformation(lapsed, "FRIENDS");
		}
		jdbc.update("update feed_items set created_at = now() - interval '1 hour' where user_id in (?, ?)", shown.id(), lapsed.id());
		jdbc.update("update users set pro = false where id = ?", lapsed.id());

		List<String> seen = new ArrayList<>();
		List<Integer> sizes = new ArrayList<>();
		String cursor = null;
		do {
			MockHttpServletResponse response = get(viewer, "/api/v1/feed?scope=FRIENDS&limit=2"
					+ (cursor == null ? "" : "&cursor=" + cursor))
					.andExpect(status().isOk()).andReturn().getResponse();
			List<String> ids = JsonPath.read(response.getContentAsString(), "$[*].id");
			seen.addAll(ids);
			sizes.add(ids.size());
			cursor = response.getHeader("X-Next-Cursor");
		}
		while (cursor != null);
		assertThat(seen).containsExactlyInAnyOrderElementsOf(expected);
		assertThat(sizes.subList(0, sizes.size() - 1)).containsOnly(2);
		get(viewer, "/api/v1/feed?scope=FRIENDS&limit=50&before=" + java.time.Instant.now().minusSeconds(7200)).andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
		get(viewer, "/api/v1/feed?cursor=nonsense").andExpect(status().isBadRequest());

		Session blocked = friends(viewer, "PagerBlocked");
		String post = transformation(viewer, "FRIENDS");
		for (int i = 0; i < 5; i++) {
			post(shown, "/api/v1/feed/" + post + "/comments", "{\"body\":\"shown " + i + "\"}").andExpect(status().isOk());
			post(blocked, "/api/v1/feed/" + post + "/comments", "{\"body\":\"blocked " + i + "\"}").andExpect(status().isOk());
		}
		jdbc.update("update notifications set created_at = now() - interval '1 hour' where user_id = ?", viewer.id());
		post(viewer, "/api/v1/blocks/" + blocked.id(), null).andExpect(status().isNoContent());
		Set<String> notifications = new HashSet<>();
		sizes.clear();
		cursor = null;
		do {
			MockHttpServletResponse response = get(viewer, "/api/v1/notifications?limit=2"
					+ (cursor == null ? "" : "&cursor=" + cursor))
					.andExpect(status().isOk()).andReturn().getResponse();
			List<String> ids = JsonPath.read(response.getContentAsString(), "$[*].id");
			assertThat((List<String>) JsonPath.read(response.getContentAsString(), "$[*].actor.id")).doesNotContain(blocked.id().toString());
			notifications.addAll(ids);
			sizes.add(ids.size());
			cursor = response.getHeader("X-Next-Cursor");
		}
		while (cursor != null);
		assertThat(notifications).hasSize(7);
		assertThat(sizes.subList(0, sizes.size() - 1)).containsOnly(2);
	}

	@Test
	void verifyRequestsGoOnlyToProFriends() throws Exception {
		Session owner = loginPro("PushOwner");
		Session pro = friends(owner, "PushPro");
		Session lapsed = friends(owner, "PushLapsed");
		jdbc.update("update users set pro = false where id = ?", lapsed.id());
		assertThat(social.verifiers(owner.id())).extracting((User u) -> u.id).containsExactly(pro.id());
	}

	private long count(Session session) throws Exception {
		return ((Number) JsonPath.read(body(get(session, "/api/v1/feed/pending-count").andExpect(status().isOk())), "$.count")).longValue();
	}
}
