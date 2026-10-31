package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.push.PushType;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class CommentRepliesIntegrationTest extends IntegrationTest {

	private String publish(Session owner) throws Exception {
		return JsonPath.read(body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"EVERYONE"}
				""".formatted(photoUrl(owner), photoUrl(owner))).andExpect(status().isOk())), "$.feedItemId");
	}

	private ResultActions reply(Session session, String itemId, String body, String replyToId) throws Exception {
		String json = replyToId == null ? "{\"body\":\"%s\"}".formatted(body) : "{\"body\":\"%s\",\"replyToId\":\"%s\"}".formatted(body, replyToId);
		return post(session, "/api/v1/feed/" + itemId + "/comments", json);
	}

	private String comment(Session session, String itemId, String body, String replyToId) throws Exception {
		return JsonPath.read(body(reply(session, itemId, body, replyToId).andExpect(status().isOk())), "$.id");
	}

	private void pushToken(Session session) throws Exception {
		put(session, "/api/v1/me/push-token", "{\"token\":\"tok-%s\"}".formatted(UUID.randomUUID())).andExpect(status().isNoContent());
	}

	private int rows(String sql, Object... args) {
		return jdbc.queryForObject(sql, Integer.class, args);
	}

	private List<String> types(Session session) throws Exception {
		return JsonPath.read(body(get(session, "/api/v1/notifications").andExpect(status().isOk())), "$[*].type");
	}

	@Test
	void repliesAttachToTheTopLevelCommentOnTheSamePost() throws Exception {
		Session owner = loginPro("ThreadOwner");
		Session first = loginPro("ThreadFirst");
		Session second = loginPro("ThreadSecond");
		String itemId = publish(owner);
		String otherItem = publish(owner);
		String top = comment(first, itemId, "Great progress", null);

		String reply = JsonPath.read(body(reply(second, itemId, "Agreed", top).andExpect(status().isOk())
				.andExpect(jsonPath("$.parentId").value(top))
				.andExpect(jsonPath("$.feedItemId").value(itemId))), "$.id");
		String nested = JsonPath.read(body(reply(owner, itemId, "Thanks both", reply).andExpect(status().isOk())
				.andExpect(jsonPath("$.parentId").value(top))), "$.id");

		get(first, "/api/v1/feed/" + itemId + "/comments").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].id").value(top))
				.andExpect(jsonPath("$[0].parentId").doesNotExist())
				.andExpect(jsonPath("$[1].id").value(reply))
				.andExpect(jsonPath("$[1].parentId").value(top))
				.andExpect(jsonPath("$[2].id").value(nested))
				.andExpect(jsonPath("$[2].parentId").value(top));

		reply(second, otherItem, "Wrong post", top).andExpect(status().isNotFound());
		reply(second, itemId, "Ghost", UUID.randomUUID().toString()).andExpect(status().isNotFound());
		assertThat(rows("select count(*) from comments where feed_item_id = ?::uuid", otherItem)).isZero();

		jdbc.update("update comments set hidden = true where id = ?::uuid", top);
		reply(second, itemId, "Hidden", top).andExpect(status().isNotFound());
		reply(first, itemId, "Still mine", top).andExpect(status().isOk()).andExpect(jsonPath("$.parentId").value(top));
		jdbc.update("update comments set hidden = false where id = ?::uuid", top);

		post(second, "/api/v1/blocks/" + first.id(), null).andExpect(status().isNoContent());
		reply(second, itemId, "Blocked", top).andExpect(status().isNotFound());
		reply(first, itemId, "Blocked too", reply).andExpect(status().isNotFound());
	}

	@Test
	void repliesNotifyTheRepliedPersonAndThePostOwnerOnce() throws Exception {
		Session owner = loginPro("ReplyOwner");
		Session author = loginPro("ReplyAuthor");
		Session replier = loginPro("ReplyReplier");
		for (Session session : List.of(owner, author, replier)) {
			pushToken(session);
		}
		String itemId = publish(owner);
		String top = comment(author, itemId, "Nice set", null);
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(1);

		String reply = comment(replier, itemId, "Same here", top);
		List<TestFakes.FakePush.Sent> sent = pushes.to(author.id(), PushType.COMMENT_REPLY);
		assertThat(sent).hasSize(1);
		assertThat(sent.getFirst().title()).isEqualTo("ReplyReplier replied to your comment");
		assertThat(sent.getFirst().data()).containsEntry("feedItemId", itemId).containsEntry("commentId", reply)
				.containsEntry("type", "COMMENT_REPLY");
		assertThat(PushType.COMMENT_REPLY.channel()).isEqualTo("community");
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(2);
		assertThat(pushes.to(owner.id(), PushType.COMMENT_REPLY)).isEmpty();

		String ownerReply = comment(owner, itemId, "Thank you", reply);
		sent = pushes.to(replier.id(), PushType.COMMENT_REPLY);
		assertThat(sent).hasSize(1);
		assertThat(sent.getFirst().title()).isEqualTo("ReplyOwner replied to your comment");
		assertThat(sent.getFirst().data()).containsEntry("commentId", ownerReply);
		assertThat(pushes.to(author.id(), PushType.COMMENT_REPLY)).hasSize(1);
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(2);

		comment(author, itemId, "Replying to myself", top);
		assertThat(pushes.to(author.id(), PushType.COMMENT_REPLY)).hasSize(1);
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(3);

		String ownerTop = comment(owner, itemId, "Owner note", null);
		comment(replier, itemId, "Reply to the owner", ownerTop);
		assertThat(pushes.to(owner.id(), PushType.COMMENT_REPLY)).hasSize(1);
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(3);

		assertThat(types(author)).containsExactly("COMMENT_REPLY");
		assertThat(types(replier)).containsExactly("COMMENT_REPLY");
		List<String> ownerTypes = types(owner);
		assertThat(ownerTypes).hasSize(4);
		assertThat(ownerTypes.stream().filter("COMMENT"::equals)).hasSize(3);
		assertThat(ownerTypes.getFirst()).isEqualTo("COMMENT_REPLY");
		get(author, "/api/v1/notifications").andExpect(jsonPath("$[0].commentId").value(reply))
				.andExpect(jsonPath("$[0].feedItemId").value(itemId))
				.andExpect(jsonPath("$[0].actor.id").value(replier.id().toString()));
	}

	@Test
	void commentPushesAlertOncePerPostAnHourAndGroupTheRestQuietly() throws Exception {
		Session owner = loginPro("GroupOwner");
		Session mia = loginPro("GroupMia");
		Session tom = loginPro("GroupTom");
		Session eva = loginPro("GroupEva");
		pushToken(owner);
		String itemId = publish(owner);
		String otherItem = publish(owner);

		comment(mia, itemId, "First", null);
		comment(tom, itemId, "Second", null);
		comment(mia, itemId, "Third", null);
		comment(eva, otherItem, "Elsewhere", null);
		List<TestFakes.FakePush.Sent> sent = pushes.to(owner.id(), PushType.COMMENT);
		assertThat(sent).extracting(TestFakes.FakePush.Sent::title).containsExactly("GroupMia commented on your post",
				"GroupTom and 1 other commented on your post", "GroupMia and 1 other commented on your post", "GroupEva commented on your post");
		assertThat(sent).extracting(s -> s.data().get("quiet")).containsExactly(null, "1", "1", null);
		assertThat(sent.get(1).data()).containsEntry("tag", "comments-" + itemId);
		assertThat(sent.get(3).data()).containsEntry("tag", "comments-" + otherItem);

		post(owner, "/api/v1/notifications/read", null).andExpect(status().is2xxSuccessful());
		comment(eva, itemId, "After reading", null);
		assertThat(pushes.to(owner.id(), PushType.COMMENT).getLast().title()).isEqualTo("GroupEva commented on your post");
		assertThat(pushes.to(owner.id(), PushType.COMMENT).getLast().data()).containsEntry("quiet", "1");

		jdbc.update("update comment_push_claims set pushed_at = pushed_at - interval '61 minutes' where feed_item_id = ?::uuid", itemId);
		comment(tom, itemId, "An hour later", null);
		assertThat(pushes.to(owner.id(), PushType.COMMENT).getLast().title()).isEqualTo("GroupTom and 1 other commented on your post");
		assertThat(pushes.to(owner.id(), PushType.COMMENT).getLast().data()).doesNotContainKey("quiet");

		patch(owner, "/api/v1/me", "{\"commentPushes\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.commentPushes").value(false));
		int before = pushes.to(owner.id()).size();
		comment(mia, itemId, "Muted", null);
		assertThat(pushes.to(owner.id())).hasSize(before);
		assertThat(types(owner).getFirst()).isEqualTo("COMMENT");
	}

	@Test
	void deletingAParentRemovesItsRepliesWithTheirLikesReportsAndNotifications() throws Exception {
		Session owner = loginPro("WipeOwner");
		Session author = loginPro("WipeAuthor");
		Session replier = loginPro("WipeReplier");
		Session reporter = loginPro("WipeReporter");
		String itemId = publish(owner);
		String top = comment(author, itemId, "Parent", null);
		String reply = comment(replier, itemId, "Child", top);
		String nested = comment(owner, itemId, "Grandchild", reply);
		post(owner, "/api/v1/comments/" + reply + "/like", null).andExpect(status().isOk());
		post(author, "/api/v1/comments/" + nested + "/like", null).andExpect(status().isOk());
		for (String id : List.of(top, reply, nested)) {
			post(reporter, "/api/v1/reports", "{\"targetType\":\"COMMENT\",\"targetId\":\"" + id + "\"}").andExpect(status().isNoContent());
		}
		String ids = "'" + String.join("','", top, reply, nested) + "'";
		assertThat(rows("select count(*) from comment_likes where comment_id::text in (" + ids + ")")).isEqualTo(2);
		assertThat(rows("select count(*) from notifications where comment_id::text in (" + ids + ")")).isPositive();

		String keep = comment(author, itemId, "Other thread", null);
		String keepReply = comment(replier, itemId, "Other child", keep);
		delete(replier, "/api/v1/comments/" + keepReply).andExpect(status().isNoContent());
		get(author, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[*].id", hasItem(keep)))
				.andExpect(jsonPath("$[*].id", not(hasItem(keepReply))));

		delete(author, "/api/v1/comments/" + top).andExpect(status().isNoContent());
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].id").value(keep));
		assertThat(rows("select count(*) from comments where id::text in (" + ids + ")")).isZero();
		assertThat(rows("select count(*) from comment_likes where comment_id::text in (" + ids + ")")).isZero();
		assertThat(rows("select count(*) from reports where target_type = 'COMMENT' and target_id::text in (" + ids + ")")).isZero();
		assertThat(rows("select count(*) from notifications where comment_id::text in (" + ids + ")")).isZero();

		String modTop = comment(author, itemId, "Moderated parent", null);
		String modReply = comment(replier, itemId, "Moderated child", modTop);
		post(reporter, "/api/v1/reports", "{\"targetType\":\"COMMENT\",\"targetId\":\"" + modReply + "\"}").andExpect(status().isNoContent());
		post(admin(), "/api/v1/admin/reports/COMMENT/" + modTop + "/remove", null).andExpect(status().isNoContent());
		assertThat(rows("select count(*) from comments where id in (?::uuid, ?::uuid)", modTop, modReply)).isZero();
		assertThat(rows("select count(*) from reports where target_id = ?::uuid", modReply)).isZero();
	}
}
