package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class SearchBodyIntegrationTest extends IntegrationTest {

	@Test
	void searchTermsCanTravelInTheBodyInsteadOfTheUrl() throws Exception {
		Session alice = loginPro("BodyAlice");
		Session bob = loginPro("BodyBob");
		post(alice, "/api/v1/social/search", "{\"q\":\"" + bob.handle() + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(bob.id().toString()));
		post(alice, "/api/v1/social/search", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
		post(login("BodyFree"), "/api/v1/social/search", "{\"q\":\"abc\"}").andExpect(status().isPaymentRequired());

		post(alice, "/api/v1/users/handle-available", "{\"handle\":\"" + bob.handle() + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.available").value(false));
		post(alice, "/api/v1/users/handle-available", "{\"handle\":\"Support\"}").andExpect(jsonPath("$.valid").value(false));
		post(alice, "/api/v1/users/handle-available", "{}").andExpect(status().isBadRequest());

		post(alice, "/api/v1/photos/search", "{\"q\":\" sneakers \"}").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].url").value("https://img.test/sneakers-regular"));
		post(alice, "/api/v1/photos/search", "{\"q\":\" \"}").andExpect(status().isBadRequest());
		post(alice, "/api/v1/photos/search", "{}").andExpect(status().isBadRequest());
		post(null, "/api/v1/photos/search", "{\"q\":\"shoes\"}").andExpect(status().isUnauthorized());
	}
}
