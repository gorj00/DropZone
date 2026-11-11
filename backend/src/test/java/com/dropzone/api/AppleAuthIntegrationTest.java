package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AppleAuthIntegrationTest extends IntegrationTest {

	private static String email(String name) {
		return name + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
	}

	private static String sub() {
		return "apple-sub-" + UUID.randomUUID();
	}

	@Test
	void appleSignInCreatesAUser() throws Exception {
		String sub = sub();
		String mail = email("Apple.New");
		appleAuth(apple.token(sub, mail, true), "Ann Apple").andExpect(status().isOk())
				.andExpect(jsonPath("$.token").isNotEmpty())
				.andExpect(jsonPath("$.user.email").value(mail.toLowerCase()))
				.andExpect(jsonPath("$.user.displayName").value("Ann Apple"))
				.andExpect(jsonPath("$.user.admin").value(false));
		assertThat(jdbc.queryForObject("select apple_sub from users where email = ?", String.class, mail.toLowerCase())).isEqualTo(sub);
		assertThat(jdbc.queryForObject("select google_sub from users where email = ?", String.class, mail.toLowerCase())).isNull();

		String unnamed = email("noname");
		Session session = appleLogin(sub(), unnamed, null);
		get(session, "/api/v1/me").andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value(unnamed.split("@")[0]));
	}

	@Test
	void appleAndGoogleWithTheSameEmailAreOneAccount() throws Exception {
		String googleSub = "sub-" + UUID.randomUUID();
		String mail = email("both");
		Session viaGoogle = googleLogin(googleSub, mail, "Both");

		String appleSub = sub();
		Session viaApple = appleLogin(appleSub, mail.toUpperCase(), "Someone Else");
		assertThat(viaApple.id()).isEqualTo(viaGoogle.id());
		assertThat(jdbc.queryForObject("select apple_sub from users where id = ?", String.class, viaGoogle.id())).isEqualTo(appleSub);
		assertThat(jdbc.queryForObject("select google_sub from users where id = ?", String.class, viaGoogle.id())).isEqualTo(googleSub);
		get(viaApple, "/api/v1/me").andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Both"));

		assertThat(googleLogin(googleSub, mail, "Both").id()).isEqualTo(viaGoogle.id());
		assertThat(appleLogin(appleSub, mail, null).id()).isEqualTo(viaGoogle.id());
		assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, mail)).isEqualTo(1);
	}

	@Test
	void googleSignInJoinsAnAccountCreatedWithApple() throws Exception {
		String mail = email("applefirst");
		Session viaApple = appleLogin(sub(), mail, "Apple First");
		String googleSub = "sub-" + UUID.randomUUID();
		Session viaGoogle = googleLogin(googleSub, mail, "Other Name");
		assertThat(viaGoogle.id()).isEqualTo(viaApple.id());
		assertThat(jdbc.queryForObject("select google_sub from users where id = ?", String.class, viaApple.id())).isEqualTo(googleSub);
	}

	@Test
	void secondAppleSignInGoesBySubjectAndKeepsTheStoredEmail() throws Exception {
		String sub = sub();
		String mail = email("stable");
		Session first = appleLogin(sub, mail, "Stable");

		assertThat(appleLogin(sub, email("relay"), "Stable").id()).isEqualTo(first.id());
		appleAuth(apple.token(sub, null, false), null).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.id").value(first.id().toString()))
				.andExpect(jsonPath("$.user.email").value(mail));
		assertThat(jdbc.queryForObject("select email from users where id = ?", String.class, first.id())).isEqualTo(mail);
	}

	@Test
	void emailLinkedToAnotherAppleAccountIsAConflict() throws Exception {
		String mail = email("taken");
		Session owner = appleLogin(sub(), mail, "Owner");
		String ownerSub = jdbc.queryForObject("select apple_sub from users where id = ?", String.class, owner.id());

		appleAuth(apple.token(sub(), mail, true), "Intruder")
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"))
				.andExpect(jsonPath("$.message").value("This account is already linked to another Apple account"))
				.andExpect(jsonPath("$.token").doesNotExist());
		assertThat(jdbc.queryForObject("select apple_sub from users where id = ?", String.class, owner.id())).isEqualTo(ownerSub);
	}

	@Test
	void invalidAndUnverifiedAppleTokensAreRejected() throws Exception {
		appleAuth("not-an-apple-token", null).andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
				.andExpect(jsonPath("$.token").doesNotExist());
		String unverified = email("unverified");
		appleAuth(apple.token(sub(), unverified, false), "Nope").andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.message").value("Apple did not share a verified e-mail"))
				.andExpect(jsonPath("$.token").doesNotExist());
		appleAuth(apple.token(sub(), " ", true), "Nope").andExpect(status().isUnauthorized());
		appleAuth(apple.token(sub(), null, true), "Nope").andExpect(status().isUnauthorized());
		appleAuth(apple.token(" ", email("nosub"), true), "Nope").andExpect(status().isUnauthorized());
		assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, unverified)).isZero();

		appleAuth("", null).andExpect(status().isBadRequest());
		appleAuth(apple.token(sub(), email("longname"), true), "N".repeat(81)).andExpect(status().isBadRequest());
	}

	@Test
	void appleRefreshTokenIsStoredAtSignInAndRevokedWhenTheAccountIsDeleted() throws Exception {
		String sub = sub();
		String mail = email("revoke");
		String code = appleTokens.code();
		String body = body(appleAuth(apple.token(sub, mail, true), "Rev", code, randomIp()).andExpect(status().isOk()));
		Session user = new Session(JsonPath.read(body, "$.token"), UUID.fromString(JsonPath.read(body, "$.user.id")),
				JsonPath.read(body, "$.user.handle"), JsonPath.read(body, "$.user.inviteCode"));
		String stored = jdbc.queryForObject("select apple_refresh_token from users where id = ?", String.class, user.id());
		assertThat(stored).isEqualTo(appleTokens.codes.get(code));

		appleAuth(apple.token(sub, mail, true), null, "unknown-code", randomIp()).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select apple_refresh_token from users where id = ?", String.class, user.id())).isEqualTo(stored);

		delete(user, "/api/v1/me").andExpect(status().isNoContent());
		assertThat(appleTokens.revoked).containsExactly(stored);
		assertThat(jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, user.id())).isZero();

		Session plain = appleLogin(sub(), email("nocode"), "Plain");
		delete(plain, "/api/v1/me").andExpect(status().isNoContent());
		assertThat(appleTokens.revoked).containsExactly(stored);
	}
}
