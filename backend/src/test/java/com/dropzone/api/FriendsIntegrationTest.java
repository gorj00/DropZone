package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class FriendsIntegrationTest extends IntegrationTest {

	@Test
	void friendRequestCanBeAccepted() throws Exception {
		Session alice = loginPro("Alice");
		Session bob = loginPro("Bob");

		String search = body(get(alice, "/api/v1/social/search?q=" + bob.handle()).andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(search, "$[*].id")).contains(bob.id().toString());

		String request = body(post(alice, "/api/v1/social/requests", "{\"userId\":\"%s\"}".formatted(bob.id()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.from.id").value(alice.id().toString()))
				.andExpect(jsonPath("$.to.id").value(bob.id().toString())));
		String requestId = JsonPath.read(request, "$.id");
		post(alice, "/api/v1/social/requests", "{\"userId\":\"%s\"}".formatted(bob.id())).andExpect(status().isConflict());
		get(alice, "/api/v1/social/requests").andExpect(jsonPath("$.outgoing[0].id").value(requestId));
		get(bob, "/api/v1/social/requests").andExpect(status().isOk())
				.andExpect(jsonPath("$.incoming.length()").value(1))
				.andExpect(jsonPath("$.incoming[0].from.handle").value(alice.handle()));

		post(alice, "/api/v1/social/requests/" + requestId + "/accept", null).andExpect(status().isNotFound());
		post(bob, "/api/v1/social/requests/" + requestId + "/accept", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(alice.id().toString()));

		get(alice, "/api/v1/social/friends").andExpect(jsonPath("$[0].id").value(bob.id().toString()));
		get(bob, "/api/v1/social/friends").andExpect(jsonPath("$[0].id").value(alice.id().toString()));
		get(bob, "/api/v1/social/requests").andExpect(jsonPath("$.incoming.length()").value(0));
		post(alice, "/api/v1/social/requests", "{\"userId\":\"%s\"}".formatted(bob.id())).andExpect(status().isConflict());

		delete(alice, "/api/v1/social/friends/" + bob.id()).andExpect(status().isNoContent());
		get(bob, "/api/v1/social/friends").andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void requestsCanBeDeclinedAndInvitesSendARequest() throws Exception {
		Session carol = loginPro("Carol");
		Session dave = loginPro("Dave");
		String request = body(post(dave, "/api/v1/social/requests", "{\"userId\":\"%s\"}".formatted(carol.id())).andExpect(status().isOk()));
		delete(carol, "/api/v1/social/requests/" + JsonPath.read(request, "$.id")).andExpect(status().isNoContent());
		get(carol, "/api/v1/social/requests").andExpect(jsonPath("$.incoming.length()").value(0));
		post(dave, "/api/v1/social/requests", "{\"userId\":\"%s\"}".formatted(dave.id())).andExpect(status().isBadRequest());

		get(carol, "/api/v1/social/invite").andExpect(status().isOk())
				.andExpect(jsonPath("$.code").value(carol.inviteCode()))
				.andExpect(jsonPath("$.url").value("https://dropzone.mobi/invite/" + carol.inviteCode()));
		post(dave, "/api/v1/social/invite/" + carol.inviteCode() + "/accept", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.id").value(carol.id().toString()))
				.andExpect(jsonPath("$.relation").value("REQUESTED"));
		get(carol, "/api/v1/social/friends").andExpect(jsonPath("$.length()").value(0));
		String incoming = body(get(carol, "/api/v1/social/requests").andExpect(jsonPath("$.incoming[0].from.id").value(dave.id().toString())));
		post(carol, "/api/v1/social/requests/" + JsonPath.read(incoming, "$.incoming[0].id") + "/accept", null).andExpect(status().isOk());
		get(carol, "/api/v1/social/friends").andExpect(jsonPath("$[0].id").value(dave.id().toString()));
		post(carol, "/api/v1/social/invite/" + carol.inviteCode() + "/accept", null).andExpect(status().isBadRequest());
		post(dave, "/api/v1/social/invite/NOPE1234/accept", null).andExpect(status().isNotFound());
	}
}
