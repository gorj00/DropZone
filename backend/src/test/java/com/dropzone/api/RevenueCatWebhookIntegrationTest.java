package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class RevenueCatWebhookIntegrationTest extends IntegrationTest {

	@Test
	void purchaseEventSetsProAndExpirationRemovesIt() throws Exception {
		Session user = login("Buyer");
		long expires = Instant.now().plus(30, ChronoUnit.DAYS).toEpochMilli();

		webhook("Bearer test-secret", event("INITIAL_PURCHASE", user.id(), expires)).andExpect(status().isOk());
		get(user, "/api/v1/me").andExpect(status().isOk())
				.andExpect(jsonPath("$.pro").value(true))
				.andExpect(jsonPath("$.proExpiresAt").isNotEmpty());
		get(user, "/api/v1/leaderboard").andExpect(status().isConflict());

		webhook("Bearer test-secret", event("CANCELLATION", user.id(), expires)).andExpect(status().isOk());
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true));

		webhook("Bearer test-secret", event("EXPIRATION", user.id(), Instant.now().minusSeconds(60).toEpochMilli()))
				.andExpect(status().isOk());
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false));
	}

	@Test
	void rejectsWrongSecretAndIgnoresUnknownUsers() throws Exception {
		Session user = login("Hacker");
		webhook("Bearer wrong", event("INITIAL_PURCHASE", user.id(), Instant.now().plusSeconds(3600).toEpochMilli()))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
		webhook(null, event("INITIAL_PURCHASE", user.id(), Instant.now().plusSeconds(3600).toEpochMilli()))
				.andExpect(status().isUnauthorized());
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false));

		webhook("Bearer test-secret", event("INITIAL_PURCHASE", UUID.randomUUID(), Instant.now().toEpochMilli()))
				.andExpect(status().isOk());
		webhook("Bearer test-secret", "{\"api_version\":\"1.0\",\"event\":{\"type\":\"TEST\",\"app_user_id\":\"$RCAnonymousID:abc\"}}")
				.andExpect(status().isOk());
		post(user, "/api/v1/billing/refresh", null).andExpect(status().isOk()).andExpect(jsonPath("$.pro").value(false));
	}

	private ResultActions webhook(String authorization, String json) throws Exception {
		var request = MockMvcRequestBuilders.post("/api/v1/webhooks/revenuecat").contentType(MediaType.APPLICATION_JSON).content(json);
		if (authorization != null) {
			request.header("Authorization", authorization);
		}
		return mvc.perform(request);
	}

	private static String event(String type, UUID userId, long expirationMs) {
		return """
				{"api_version":"1.0","event":{"type":"%s","id":"%s","app_user_id":"%s","original_app_user_id":"%s",
				 "aliases":["%s"],"entitlement_ids":["pro"],"product_id":"pro_monthly","period_type":"NORMAL",
				 "expiration_at_ms":%d,"event_timestamp_ms":%d,"store":"PLAY_STORE","environment":"SANDBOX"}}
				""".formatted(type, UUID.randomUUID(), userId, userId, userId, expirationMs, System.currentTimeMillis());
	}
}
