package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class GoogleAuthIntegrationTest extends IntegrationTest {

	private static String email(String name) {
		return name + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
	}

	@Test
	void sameSubjectSignsIntoTheSameAccount() throws Exception {
		String sub = "sub-" + UUID.randomUUID();
		String mail = email("same");
		Session first = googleLogin(sub, mail, "Same");
		Session second = googleLogin(sub, mail, "Same");
		assertThat(second.id()).isEqualTo(first.id());
		assertThat(jdbc.queryForObject("select google_sub from users where id = ?", String.class, first.id())).isEqualTo(sub);
	}

	@Test
	void emailFallbackLinksOnlyAnAccountWithoutGoogleSubject() throws Exception {
		String mail = email("legacy");
		Session legacy = googleLogin("sub-" + UUID.randomUUID(), mail, "Legacy");
		jdbc.update("update users set google_sub = null where id = ?", legacy.id());

		String newSub = "sub-" + UUID.randomUUID();
		Session linked = googleLogin(newSub, mail.toUpperCase(), "Legacy");
		assertThat(linked.id()).isEqualTo(legacy.id());
		assertThat(jdbc.queryForObject("select google_sub from users where id = ?", String.class, legacy.id())).isEqualTo(newSub);

		googleAuth(google.token("sub-" + UUID.randomUUID(), mail, true, "Intruder", null))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"))
				.andExpect(jsonPath("$.token").doesNotExist());
	}

	@Test
	void unverifiedEmailAndUnknownTokensAreRejected() throws Exception {
		googleAuth(google.token("sub-" + UUID.randomUUID(), email("unverified"), false, "Nope", null))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.token").doesNotExist());
		googleAuth("not-a-google-token").andExpect(status().isUnauthorized());
	}

	@Test
	void storedEmailFollowsTheVerifiedGoogleEmailAndIsLowerCased() throws Exception {
		String sub = "sub-" + UUID.randomUUID();
		Session user = googleLogin(sub, "Mixed.Case-" + UUID.randomUUID().toString().substring(0, 8) + "@Test.DEV", "Mixed");
		String stored = jdbc.queryForObject("select email from users where id = ?", String.class, user.id());
		assertThat(stored).isEqualTo(stored.toLowerCase());

		String changed = email("Changed");
		googleLogin(sub, changed, "Mixed");
		get(user, "/api/v1/me").andExpect(jsonPath("$.email").value(changed.toLowerCase()));

		Session other = googleLogin("sub-" + UUID.randomUUID(), email("taken"), "Taken");
		String taken = jdbc.queryForObject("select email from users where id = ?", String.class, other.id());
		googleLogin(sub, taken, "Mixed");
		get(user, "/api/v1/me").andExpect(jsonPath("$.email").value(changed.toLowerCase()));
	}

	@Test
	void googlePictureIsOnlyUsedWhenTheAccountIsCreated() throws Exception {
		String sub = "sub-" + UUID.randomUUID();
		String mail = email("picture");
		String picture = "https://lh3.googleusercontent.com/a/photo";
		String body = body(googleAuth(google.token(sub, mail, true, "Pic", picture)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.avatarUrl").value(picture)));
		Session user = withToken(new Session(null, UUID.fromString(JsonPath.read(body, "$.user.id")), null, null),
				JsonPath.read(body, "$.token"));
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"\"}").andExpect(status().isOk());
		googleAuth(google.token(sub, mail, true, "Pic", picture)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.avatarUrl").doesNotExist());
	}

	@Test
	void longAndReservedGoogleNamesStillSignIn() throws Exception {
		String longName = "N".repeat(120);
		String body = body(googleAuth(google.token("sub-" + UUID.randomUUID(), email("long"), true, longName, null))
				.andExpect(status().isOk()));
		assertThat((String) JsonPath.read(body, "$.user.displayName")).hasSize(80);

		String mail = email("brand");
		body = body(googleAuth(google.token("sub-" + UUID.randomUUID(), mail, true, "DropZone Official", null))
				.andExpect(status().isOk()));
		assertThat((String) JsonPath.read(body, "$.user.displayName")).isEqualTo(mail.split("@")[0]);
	}

	@Test
	void reservedHandlesAndNamesAreRejected() throws Exception {
		Session user = login("Reserved");
		patch(user, "/api/v1/me", "{\"handle\":\"admin\"}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("This handle is reserved"));
		get(user, "/api/v1/users/handle-available?handle=Support").andExpect(status().isOk())
				.andExpect(jsonPath("$.valid").value(false));
		patch(user, "/api/v1/me", "{\"displayName\":\"DropZone Team\"}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"displayName\":\"Drop Fan\"}").andExpect(status().isOk());

		Session named = googleLogin("sub-" + UUID.randomUUID(), email("dropzone"), "Moderator");
		assertThat(named.handle()).isNotEqualTo("moderator");
	}

	@Test
	void adminNeedsAGoogleLinkedAccount() throws Exception {
		Session admin = googleLogin("moderator-sub", "moderator@test.dev", "Mod");
		get(admin, "/api/v1/me").andExpect(jsonPath("$.admin").value(true));
		try {
			jdbc.update("update users set google_sub = null where id = ?", admin.id());
			get(admin, "/api/v1/me").andExpect(jsonPath("$.admin").value(false));
			get(admin, "/api/v1/admin/reports").andExpect(status().isForbidden());
		}
		finally {
			jdbc.update("update users set google_sub = 'moderator-sub' where id = ?", admin.id());
		}
	}
}
