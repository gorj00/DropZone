package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.domain.User;
import com.dropzone.api.user.UserService;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.support.TransactionTemplate;

class AccountIntegrationTest extends IntegrationTest {

	@Autowired
	private TransactionTemplate tx;

	@Autowired
	private UserService userService;

	@Test
	void deletingTheAccountRemovesRowsUploadsAndToken() throws Exception {
		Session user = loginPro("Leaver");
		Session friend = loginPro("Stayer");
		joinByInvite(friend, user);
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = JsonPath.<List<String>>read(body(get(user, "/api/v1/quests")), "$[?(@.code=='HEALTHY_MEAL')].id").getFirst();
		post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + uploadPhoto(user) + "\"}").andExpect(status().isOk());
		String set = body(post(user, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"EVERYONE"}
				""".formatted(uploadPhoto(user), uploadPhoto(user))).andExpect(status().isOk()));
		String itemId = JsonPath.read(set, "$.feedItemId");
		post(friend, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"Nice\"}").andExpect(status().isOk());
		post(user, "/api/v1/feed/" + itemId + "/hype", null).andExpect(status().isOk());
		assertThat(storage.hasPrefix("uploads/" + user.id() + "/")).isTrue();

		delete(user, "/api/v1/me").andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, user.id())).isZero();
		for (String table : List.of("goals", "proofs", "quest_completions", "feed_items", "transformations", "hypes", "comments",
				"weigh_ins", "measurements", "user_quests", "notifications")) {
			assertThat(jdbc.queryForObject("select count(*) from " + table + " where user_id = ?", Integer.class, user.id()))
					.as(table).isZero();
		}
		assertThat(jdbc.queryForObject("select count(*) from friendships where user_id = ? or friend_id = ?", Integer.class, user.id(),
				user.id())).isZero();
		assertThat(storage.hasPrefix("uploads/" + user.id() + "/")).isFalse();
		get(user, "/api/v1/me").andExpect(status().isUnauthorized());
		get(friend, "/api/v1/social/friends").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void consentIsRequiredUntilTheCurrentVersionsAreAccepted() throws Exception {
		Session user = login("Consent");
		get(user, "/api/v1/me").andExpect(jsonPath("$.consentRequired").value(true));
		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"0\",\"privacyVersion\":\"1\",\"ageConfirmed\":true}").andExpect(status().isConflict());
		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"1\",\"privacyVersion\":\"1\",\"ageConfirmed\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.consentRequired").value(false));
		assertThat(jdbc.queryForObject("select terms_accepted_at from users where id = ?", Timestamp.class, user.id())).isNotNull();
		jdbc.update("update users set terms_version = '0' where id = ?", user.id());
		get(user, "/api/v1/me").andExpect(jsonPath("$.consentRequired").value(true));
	}

	@Test
	void consentStoresTheStatsChoice() throws Exception {
		Session user = login("StatsChoice");
		get(user, "/api/v1/me").andExpect(jsonPath("$.shareStats").value(false));
		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"1\",\"privacyVersion\":\"1\",\"ageConfirmed\":true,\"shareStats\":true,"
				+ "\"region\":{\"source\":\"SIM\",\"value\":\"CZ\",\"eu\":true}}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.shareStats").value(true));
		assertThat(jdbc.queryForObject("select share_stats_at from users where id = ?", Timestamp.class, user.id())).isNotNull();
		assertThat(jdbc.queryForObject("select region_source || ':' || region_value || ':' || region_eu from users where id = ?", String.class, user.id()))
				.isEqualTo("SIM:CZ:true");
		patch(user, "/api/v1/me", "{\"shareStats\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.shareStats").value(false));
		assertThat(jdbc.queryForObject("select share_stats from users where id = ?", Boolean.class, user.id())).isFalse();
	}

	@Test
	void consentNeedsTheAgeConfirmation() throws Exception {
		Session user = login("AgeGate");
		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"1\",\"privacyVersion\":\"1\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("Confirm that you're 18 or older"));
		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"1\",\"privacyVersion\":\"1\",\"ageConfirmed\":false}")
				.andExpect(status().isBadRequest());
		get(user, "/api/v1/me").andExpect(jsonPath("$.consentRequired").value(true));
		assertThat(jdbc.queryForObject("select age_confirmed_at from users where id = ?", Timestamp.class, user.id())).isNull();

		post(user, "/api/v1/me/consent", "{\"termsVersion\":\"1\",\"privacyVersion\":\"1\",\"ageConfirmed\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.consentRequired").value(false));
		assertThat(jdbc.queryForObject("select age_confirmed_at from users where id = ?", Timestamp.class, user.id())).isNotNull();

		Session earlier = login("ConsentedBefore");
		jdbc.update("update users set terms_version = '1', privacy_version = '1', terms_accepted_at = now() where id = ?", earlier.id());
		get(earlier, "/api/v1/me").andExpect(jsonPath("$.consentRequired").value(true));
	}

	@Test
	void publicConfigNeedsNoTokenAndIgnoresStaleOnes() throws Exception {
		mvc.perform(MockMvcRequestBuilders.get("/api/v1/config")).andExpect(status().isOk())
				.andExpect(jsonPath("$.minVersionCode").value(1))
				.andExpect(jsonPath("$.termsVersion").value("1"))
				.andExpect(jsonPath("$.privacyVersion").value("1"))
				.andExpect(jsonPath("$.termsUrl").doesNotExist())
				.andExpect(jsonPath("$.deleteAccountUrl").doesNotExist());
		mvc.perform(MockMvcRequestBuilders.get("/api/v1/config").header("Authorization", "Bearer stale")).andExpect(status().isOk());
	}

	@Test
	void meReissuesATokenOlderThanADay() throws Exception {
		Session user = login("Sliding");
		get(user, "/api/v1/me").andExpect(status().isOk()).andExpect(header().doesNotExist("X-Auth-Token"));
		Instant issued = Instant.now().minus(2, ChronoUnit.DAYS);
		Session old = withToken(user, forgeToken(JWT_SECRET, "dropzone", List.of("dropzone-app"), user.id(), 0, issued,
				issued.plus(7, ChronoUnit.DAYS)));
		String fresh = get(old, "/api/v1/me").andExpect(status().isOk()).andExpect(header().exists("X-Auth-Token"))
				.andReturn().getResponse().getHeader("X-Auth-Token");
		get(withToken(user, fresh), "/api/v1/me").andExpect(status().isOk()).andExpect(header().doesNotExist("X-Auth-Token"));
		mvc.perform(MockMvcRequestBuilders.get("/api/v1/me").header("Authorization", "Bearer " + user.token())
				.header("Origin", "https://localhost")).andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Expose-Headers", containsString("X-Auth-Token")));
	}

	@Test
	void profileUpdateRacingAWebhookGrantKeepsBothChanges() throws Exception {
		Session user = login("Racer");
		UUID id = user.id();
		tx.executeWithoutResult(status -> {
			User loaded = userService.get(id);
			loaded.displayName = "Racer Renamed";
			CompletableFuture.runAsync(() -> {
				try {
					mvc.perform(MockMvcRequestBuilders.post("/api/v1/webhooks/revenuecat").header("Authorization", "Bearer test-secret")
							.contentType(MediaType.APPLICATION_JSON)
							.content("""
									{"event":{"type":"INITIAL_PURCHASE","app_user_id":"%s","entitlement_ids":["pro"],"expiration_at_ms":%d}}
									""".formatted(id, Instant.now().plus(30, ChronoUnit.DAYS).toEpochMilli())))
							.andExpect(status().isOk());
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			}).join();
		});
		get(user, "/api/v1/me").andExpect(jsonPath("$.displayName").value("Racer Renamed")).andExpect(jsonPath("$.pro").value(true));
	}
}
