package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

class UserProfileIntegrationTest extends IntegrationTest {

	private String publish(Session owner, String visibility) throws Exception {
		return JsonPath.read(body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"%s"}
				""".formatted(photoUrl(owner), photoUrl(owner), visibility)).andExpect(status().isOk())), "$.feedItemId");
	}

	private String request(Session from, Session to) throws Exception {
		return JsonPath.read(body(post(from, "/api/v1/social/requests", "{\"userId\":\"" + to.id() + "\"}").andExpect(status().isOk())), "$.id");
	}

	private String profile(Session other) {
		return "/api/v1/users/" + other.id() + "/profile";
	}

	private List<String> feed(Session viewer, Session author) throws Exception {
		return JsonPath.read(body(get(viewer, "/api/v1/users/" + author.id() + "/feed").andExpect(status().isOk())), "$[*].id");
	}

	@Test
	void profileShowsTheRelationAndThePendingRequest() throws Exception {
		Session me = loginPro("ProfileMe");
		Session friend = loginPro("ProfileFriend");
		Session stranger = loginPro("ProfileStranger");
		Session asked = loginPro("ProfileAsked");
		Session asking = loginPro("ProfileAsking");
		Session free = login("ProfileFree");
		befriend(me, friend);
		String outgoing = request(me, asked);
		String incoming = request(asking, me);

		get(me, profile(me)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.id").value(me.id().toString()))
				.andExpect(jsonPath("$.relation").value("SELF"))
				.andExpect(jsonPath("$.requestId").doesNotExist());
		get(me, profile(friend)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.displayName").value("ProfileFriend"))
				.andExpect(jsonPath("$.user.handle").value(friend.handle()))
				.andExpect(jsonPath("$.relation").value("FRIEND"))
				.andExpect(jsonPath("$.requestId").doesNotExist());
		get(me, profile(stranger)).andExpect(jsonPath("$.relation").value("NONE")).andExpect(jsonPath("$.requestId").doesNotExist());
		get(me, profile(asked)).andExpect(jsonPath("$.relation").value("REQUESTED")).andExpect(jsonPath("$.requestId").value(outgoing));
		get(me, profile(asking)).andExpect(jsonPath("$.relation").value("INCOMING")).andExpect(jsonPath("$.requestId").value(incoming));
		get(asked, profile(me)).andExpect(jsonPath("$.relation").value("INCOMING")).andExpect(jsonPath("$.requestId").value(outgoing));

		get(me, "/api/v1/users/" + UUID.randomUUID() + "/profile").andExpect(status().isNotFound());
		get(me, "/api/v1/users/" + UUID.randomUUID() + "/feed").andExpect(status().isNotFound());
		get(free, profile(me)).andExpect(status().isPaymentRequired());
		get(free, "/api/v1/users/" + me.id() + "/feed").andExpect(status().isPaymentRequired());
		get(free, profile(free)).andExpect(status().isOk()).andExpect(jsonPath("$.relation").value("SELF"));
		get(free, "/api/v1/users/" + free.id() + "/feed").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void blockedAndSuspendedUsersAreNotFound() throws Exception {
		Session me = loginPro("HiddenMe");
		Session blocker = loginPro("HiddenBlocker");
		Session blocked = loginPro("HiddenBlocked");
		Session suspended = loginPro("HiddenSuspended");
		publish(blocker, "EVERYONE");
		post(blocker, "/api/v1/blocks/" + me.id(), null).andExpect(status().isNoContent());
		post(me, "/api/v1/blocks/" + blocked.id(), null).andExpect(status().isNoContent());
		jdbc.update("update users set suspended_at = now() where id = ?", suspended.id());

		for (Session other : List.of(blocker, blocked, suspended)) {
			get(me, profile(other)).andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("User not found"));
			get(me, "/api/v1/users/" + other.id() + "/feed").andExpect(status().isNotFound());
		}
		get(blocker, profile(me)).andExpect(status().isNotFound());
		get(blocked, "/api/v1/users/" + me.id() + "/feed").andExpect(status().isNotFound());

		delete(blocker, "/api/v1/blocks/" + me.id()).andExpect(status().isNoContent());
		get(me, profile(blocker)).andExpect(status().isOk()).andExpect(jsonPath("$.relation").value("NONE"));
		assertThat(feed(me, blocker)).hasSize(1);
	}

	@Test
	void userFeedShowsOnlyTheAuthorsPostsTheViewerMaySeeNewestFirst() throws Exception {
		Session author = loginPro("FeedAuthor");
		Session friend = loginPro("FeedFriend");
		Session stranger = loginPro("FeedStranger");
		befriend(author, friend);
		List<String> all = new ArrayList<>();
		List<String> open = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			String id = publish(author, i % 2 == 0 ? "EVERYONE" : "FRIENDS");
			jdbc.update("update feed_items set created_at = now() - make_interval(mins => ?) where id = ?::uuid", 10 - i, id);
			all.addFirst(id);
			if (i % 2 == 0) {
				open.addFirst(id);
			}
		}
		String hidden = publish(author, "EVERYONE");
		jdbc.update("update feed_items set hidden = true, created_at = now() - interval '1 minute' where id = ?::uuid", hidden);
		publish(friend, "EVERYONE");
		publish(stranger, "EVERYONE");

		assertThat(feed(stranger, author)).containsExactlyElementsOf(open);
		assertThat(feed(friend, author)).containsExactlyElementsOf(all);
		List<String> own = new ArrayList<>(all);
		own.addFirst(hidden);
		assertThat(feed(author, author)).containsExactlyElementsOf(own);
		get(stranger, "/api/v1/users/" + author.id() + "/feed").andExpect(jsonPath("$[0].user.id").value(author.id().toString()))
				.andExpect(jsonPath("$[0].isPublic").value(true));

		List<String> seen = new ArrayList<>();
		List<Integer> sizes = new ArrayList<>();
		String cursor = null;
		do {
			MockHttpServletResponse response = get(friend, "/api/v1/users/" + author.id() + "/feed?limit=2"
					+ (cursor == null ? "" : "&cursor=" + cursor)).andExpect(status().isOk()).andReturn().getResponse();
			List<String> ids = JsonPath.read(response.getContentAsString(), "$[*].id");
			seen.addAll(ids);
			sizes.add(ids.size());
			cursor = response.getHeader("X-Next-Cursor");
		}
		while (cursor != null);
		assertThat(seen).containsExactlyElementsOf(all);
		assertThat(sizes).startsWith(2, 2);
		assertThat(sizes.stream().mapToInt(Integer::intValue).sum()).isEqualTo(5);

		get(stranger, "/api/v1/users/" + author.id() + "/feed?limit=2").andExpect(jsonPath("$.length()").value(2));
		get(friend, "/api/v1/users/" + author.id() + "/feed?cursor=nonsense").andExpect(status().isBadRequest());

		jdbc.update("update users set pro = false where id = ?", author.id());
		assertThat(feed(stranger, author)).isEmpty();
		get(stranger, profile(author)).andExpect(status().isOk());
	}
}
