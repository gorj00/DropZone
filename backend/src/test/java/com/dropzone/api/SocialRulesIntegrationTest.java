package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.push.PushType;
import com.jayway.jsonpath.JsonPath;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SocialRulesIntegrationTest extends IntegrationTest {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

	private static String prefix() {
		StringBuilder out = new StringBuilder("q");
		for (int i = 0; i < 7; i++) {
			out.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
		}
		return out.toString();
	}

	private void pushToken(Session session) throws Exception {
		put(session, "/api/v1/me/push-token", "{\"token\":\"tok-%s\"}".formatted(UUID.randomUUID())).andExpect(status().isNoContent());
	}

	private List<String> search(Session session, String q) throws Exception {
		return JsonPath.read(body(post(session, "/api/v1/social/search", "{\"q\":\"" + q + "\"}").andExpect(status().isOk())), "$[*].id");
	}

	private Session named(String handle, String displayName) throws Exception {
		Session session = signUp("Searchable");
		patch(session, "/api/v1/me", "{\"handle\":\"%s\",\"displayName\":\"%s\"}".formatted(handle, displayName)).andExpect(status().isOk());
		return session;
	}

	@Test
	void anInviteLinkSendsAFriendRequestTheOwnerAccepts() throws Exception {
		Session owner = loginPro("InviteOwner");
		Session visitor = loginPro("InviteVisitor");
		pushToken(owner);
		String accept = "/api/v1/social/invite/" + owner.inviteCode() + "/accept";

		post(visitor, accept, null).andExpect(status().isOk()).andExpect(jsonPath("$.user.id").value(owner.id().toString()))
				.andExpect(jsonPath("$.relation").value("REQUESTED"));
		post(visitor, accept, null).andExpect(status().isOk()).andExpect(jsonPath("$.relation").value("REQUESTED"));
		get(owner, "/api/v1/social/friends").andExpect(jsonPath("$.length()").value(0));
		String requests = body(get(owner, "/api/v1/social/requests").andExpect(jsonPath("$.incoming.length()").value(1))
				.andExpect(jsonPath("$.incoming[0].from.id").value(visitor.id().toString())));
		assertThat(pushes.to(owner.id(), PushType.FRIEND_REQUEST)).hasSize(1);
		assertThat(jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = 'FRIEND_REQUEST'", Integer.class,
				owner.id())).isEqualTo(1);

		post(owner, "/api/v1/social/requests/" + JsonPath.read(requests, "$.incoming[0].id") + "/accept", null).andExpect(status().isOk());
		post(visitor, accept, null).andExpect(jsonPath("$.relation").value("FRIEND"));

		Session asked = loginPro("InviteAsked");
		post(owner, "/api/v1/social/requests", "{\"userId\":\"" + asked.id() + "\"}").andExpect(status().isOk());
		post(asked, accept, null).andExpect(status().isOk()).andExpect(jsonPath("$.relation").value("FRIEND"));
		assertThat((List<String>) JsonPath.read(body(get(owner, "/api/v1/social/friends")), "$[*].id")).contains(asked.id().toString());
		get(asked, "/api/v1/social/requests").andExpect(jsonPath("$.incoming.length()").value(0));
		get(owner, "/api/v1/social/requests").andExpect(jsonPath("$.outgoing.length()").value(0));
	}

	@Test
	void searchMatchesTheHandleStartOrTheExactNameAndSkipsHiddenUsers() throws Exception {
		Session searcher = loginPro("Searcher");
		get(searcher, "/api/v1/me").andExpect(jsonPath("$.hiddenFromSearch").value(false))
				.andExpect(jsonPath("$.hiddenFromLeaderboards").value(false)).andExpect(jsonPath("$.verifyRequestPushes").value(true));
		String prefix = prefix();
		Session anna = named(prefix + "anna", "Anna");
		Session bob = named(prefix + "bob", "Bob");
		Session carl = named("c" + prefix(), "Carl " + prefix);
		Session hidden = named(prefix + "hid", "Hidden");
		patch(hidden, "/api/v1/me", "{\"hiddenFromSearch\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.hiddenFromSearch").value(true));

		assertThat(search(searcher, prefix.substring(0, 2))).isEmpty();
		assertThat(search(searcher, prefix)).containsExactly(anna.id().toString(), bob.id().toString());
		assertThat(search(searcher, "@" + prefix.toUpperCase())).containsExactly(anna.id().toString(), bob.id().toString());
		assertThat(search(searcher, prefix + "an")).containsExactly(anna.id().toString());
		assertThat(search(searcher, prefix.substring(1) + "anna")).doesNotContain(anna.id().toString());
		assertThat(search(searcher, "CARL " + prefix.toUpperCase())).containsExactly(carl.id().toString());
		assertThat(search(searcher, "carl " + prefix.substring(0, 4))).doesNotContain(carl.id().toString());
		assertThat(search(searcher, prefix + "hid")).isEmpty();

		patch(hidden, "/api/v1/me", "{\"hiddenFromSearch\":false}").andExpect(status().isOk());
		assertThat(search(searcher, prefix + "hid")).containsExactly(hidden.id().toString());

		String many = prefix();
		for (int i = 0; i < 11; i++) {
			named(many + i, "Many " + i);
		}
		assertThat(search(searcher, many)).hasSize(10);
		get(searcher, "/api/v1/social/search?q=" + many).andExpect(jsonPath("$.length()").value(10));
	}

	@Test
	void freeUsersSeeTheirIncomingRequestsButNeedProToAccept() throws Exception {
		Session free = login("FreeInbox");
		Session sender = loginPro("ProSender");
		post(sender, "/api/v1/social/requests", "{\"userId\":\"" + free.id() + "\"}").andExpect(status().isOk());
		String requests = body(get(free, "/api/v1/social/requests").andExpect(status().isOk())
				.andExpect(jsonPath("$.incoming.length()").value(1))
				.andExpect(jsonPath("$.incoming[0].from.id").value(sender.id().toString())));
		post(free, "/api/v1/social/requests/" + JsonPath.read(requests, "$.incoming[0].id") + "/accept", null)
				.andExpect(status().isPaymentRequired());
		get(free, "/api/v1/social/friends").andExpect(status().isPaymentRequired());
	}

	@Test
	void commentsPushOnlyThePostAuthor() throws Exception {
		Session owner = loginPro("CommentOwner");
		Session first = loginPro("FirstCommenter");
		Session second = loginPro("SecondCommenter");
		befriend(owner, first);
		befriend(owner, second);
		for (Session session : List.of(owner, first, second)) {
			pushToken(session);
		}
		String postId = JsonPath.read(body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"FRIENDS"}
				""".formatted(photoUrl(owner), photoUrl(owner))).andExpect(status().isOk())), "$.feedItemId");

		String comment = JsonPath.read(body(post(first, "/api/v1/feed/" + postId + "/comments", "{\"body\":\"Looking strong!\"}")
				.andExpect(status().isOk())), "$.id");
		List<TestFakes.FakePush.Sent> sent = pushes.to(owner.id(), PushType.COMMENT);
		assertThat(sent).hasSize(1);
		assertThat(sent.getFirst().title()).isEqualTo("FirstCommenter commented on your post");
		assertThat(sent.getFirst().data()).containsEntry("feedItemId", postId).containsEntry("commentId", comment).containsEntry("type", "COMMENT");
		assertThat(PushType.COMMENT.channel()).isEqualTo("community");

		post(owner, "/api/v1/feed/" + postId + "/comments", "{\"body\":\"Thanks!\"}").andExpect(status().isOk());
		post(second, "/api/v1/feed/" + postId + "/comments", "{\"body\":\"Wow\"}").andExpect(status().isOk());
		assertThat(pushes.to(owner.id(), PushType.COMMENT)).hasSize(2);
		assertThat(pushes.to(first.id(), PushType.COMMENT)).isEmpty();
		assertThat(pushes.to(second.id(), PushType.COMMENT)).isEmpty();
	}

	@Test
	void verifyRequestsPushEachFriendAtMostOnceInThreeHoursAndCanBeMuted() throws Exception {
		Session owner = loginPro("BatchOwner");
		Session a = loginPro("BatchA");
		Session b = loginPro("BatchB");
		Session muted = loginPro("BatchMuted");
		for (Session friend : List.of(a, b, muted)) {
			befriend(owner, friend);
			pushToken(friend);
		}
		patch(muted, "/api/v1/me", "{\"verifyRequestPushes\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.verifyRequestPushes").value(false));
		onboardLose(owner, 2, "WEIGH_IN");
		String[] quests = new String[3];
		for (int i = 0; i < 3; i++) {
			quests[i] = JsonPath.read(body(post(owner, "/api/v1/quests/custom", """
					{"name":"Batch %d","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true}
					""".formatted(i)).andExpect(status().isOk())), "$.id");
		}

		post(owner, "/api/v1/quests/" + quests[0] + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(jsonPath("$.status").value("PENDING"));
		post(owner, "/api/v1/quests/" + quests[1] + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(jsonPath("$.status").value("PENDING"));
		List<TestFakes.FakePush.Sent> toA = pushes.to(a.id(), PushType.VERIFY_REQUEST);
		assertThat(toA).hasSize(1);
		assertThat(toA.getFirst().title()).isEqualTo("BatchOwner needs a verify");
		assertThat(toA.getFirst().data()).containsEntry("count", "1").containsKey("proofId").containsKey("feedItemId");
		assertThat(pushes.to(b.id(), PushType.VERIFY_REQUEST)).hasSize(1);
		assertThat(pushes.to(muted.id(), PushType.VERIFY_REQUEST)).isEmpty();

		jdbc.update("update verify_push_claims set pushed_at = now() - interval '3 hours 1 minute' where user_id = ?", a.id());
		post(owner, "/api/v1/quests/" + quests[2] + "/complete", "{\"photoUrl\":\"" + photoUrl(owner) + "\"}")
				.andExpect(jsonPath("$.status").value("PENDING"));
		toA = pushes.to(a.id(), PushType.VERIFY_REQUEST);
		assertThat(toA).hasSize(2);
		assertThat(toA.get(1).title()).isEqualTo("3 proofs need your verify");
		assertThat(toA.get(1).data()).containsEntry("count", "3");
		assertThat(pushes.to(b.id(), PushType.VERIFY_REQUEST)).hasSize(1);
		assertThat(pushes.to(muted.id(), PushType.VERIFY_REQUEST)).isEmpty();
	}

	private Session lifter(String name, double before, double now) throws Exception {
		Session session = loginPro(name);
		post(session, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"STRENGTH","metricLabel":"Bench press","unit":"kg","startValue":%s,"goalValue":%s,"checkpoints":2,
				 "questCodes":["WEIGH_IN"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""".formatted(before, before + 50)).andExpect(status().isOk());
		jdbc.update("delete from measurements where user_id = ?", session.id());
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		jdbc.update("insert into measurements (id, user_id, metric, day, value, created_at) values (?, ?, 'STRENGTH', ?, ?, now())",
				UUID.randomUUID(), session.id(), today.minusDays(10), before);
		jdbc.update("insert into measurements (id, user_id, metric, day, value, created_at) values (?, ?, 'STRENGTH', ?, ?, now())",
				UUID.randomUUID(), session.id(), today, now);
		return session;
	}

	@Test
	void gainBoardsRankByPercentAndHiddenPeopleOnlySeeThemselvesAsMe() throws Exception {
		Session me = lifter("Percent Me", 100, 110);
		Session small = lifter("Percent Small", 20, 25);
		Session big = lifter("Percent Big", 200, 212);
		befriend(me, small);
		befriend(me, big);
		befriend(small, big);

		String board = body(get(me, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk()).andExpect(jsonPath("$.me").doesNotExist()));
		assertThat((List<String>) JsonPath.read(board, "$.entries[*].user.id"))
				.containsExactly(small.id().toString(), me.id().toString(), big.id().toString());
		assertThat((List<Double>) JsonPath.read(board, "$.entries[*].percent")).containsExactly(25.0, 10.0, 6.0);
		assertThat((List<Double>) JsonPath.read(board, "$.entries[*].delta")).containsExactly(5.0, 10.0, 12.0);
		assertThat((List<Integer>) JsonPath.read(board, "$.entries[*].rank")).containsExactly(1, 2, 3);

		patch(small, "/api/v1/me", "{\"hiddenFromLeaderboards\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.hiddenFromLeaderboards").value(true));
		board = body(get(me, "/api/v1/leaderboard?period=WEEK"));
		assertThat((List<String>) JsonPath.read(board, "$.entries[*].user.id")).containsExactly(me.id().toString(), big.id().toString());
		assertThat((List<Integer>) JsonPath.read(board, "$.entries[*].rank")).containsExactly(1, 2);

		String own = body(get(small, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(own, "$.entries[*].user.id")).containsExactly(me.id().toString(), big.id().toString());
		assertThat((String) JsonPath.read(own, "$.me.user.id")).isEqualTo(small.id().toString());
		assertThat((Integer) JsonPath.read(own, "$.me.rank")).isEqualTo(1);
		assertThat((Double) JsonPath.read(own, "$.me.percent")).isEqualTo(25.0);
	}
}
