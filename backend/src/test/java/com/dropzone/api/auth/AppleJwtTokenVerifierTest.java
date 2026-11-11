package com.dropzone.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

class AppleJwtTokenVerifierTest {

	private static final String BUNDLE = "com.dropzone.app";

	private static KeyPair apple;
	private static KeyPair stranger;

	@BeforeAll
	static void keys() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		apple = generator.generateKeyPair();
		stranger = generator.generateKeyPair();
	}

	private static AppProperties props(List<String> clientIds) {
		return new AppProperties(new AppProperties.Auth("x".repeat(32), 7, List.of(), clientIds, null, null, null, false), null, null, null, null, null, null,
				null, null, null, null);
	}

	private static AppleJwtTokenVerifier verifier(String... clientIds) {
		return new AppleJwtTokenVerifier(List.of(clientIds), NimbusJwtDecoder.withPublicKey((RSAPublicKey) apple.getPublic()).build());
	}

	private static JWTClaimsSet.Builder claims() {
		Instant now = Instant.now();
		return new JWTClaimsSet.Builder().issuer(AppleJwtTokenVerifier.ISSUER).audience(BUNDLE).subject("001234.abcdef.5678")
				.issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(600)))
				.claim("email", "ann@privaterelay.appleid.com").claim("email_verified", true);
	}

	private static String token(KeyPair key, JWTClaimsSet claims) throws Exception {
		SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(), claims);
		jwt.sign(new RSASSASigner(key.getPrivate()));
		return jwt.serialize();
	}

	private static void rejected(AppleJwtTokenVerifier verifier, String token) {
		assertThatThrownBy(() -> verifier.verify(token)).isInstanceOfSatisfying(ApiException.class, e -> {
			assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
			assertThat(e.getMessage()).isEqualTo("Invalid Apple token");
		});
	}

	@Test
	void missingAudienceMeansAppleSignInIsOff() {
		for (List<String> clientIds : List.of(List.<String>of(), List.of(" "))) {
			AppleJwtTokenVerifier verifier = new AppleJwtTokenVerifier(props(clientIds));
			assertThatThrownBy(() -> verifier.verify("anything")).isInstanceOfSatisfying(ApiException.class, e -> {
				assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
				assertThat(e.getMessage()).isEqualTo("Apple sign-in is not configured");
			});
		}
		AppleJwtTokenVerifier unset = new AppleJwtTokenVerifier(props(null));
		assertThatThrownBy(() -> unset.verify("anything")).isInstanceOf(ApiException.class).hasMessage("Apple sign-in is not configured");
	}

	@Test
	void malformedTokenIsRejected() {
		rejected(new AppleJwtTokenVerifier(props(List.of(BUNDLE))), "not.a.jwt");
		rejected(verifier(BUNDLE), "not.a.jwt");
	}

	@Test
	void tokenSignedByAppleForThisAppIsAccepted() throws Exception {
		AppleTokenVerifier.AppleIdentity identity = verifier("other.app", " " + BUNDLE + " ").verify(token(apple, claims().build()));
		assertThat(identity.subject()).isEqualTo("001234.abcdef.5678");
		assertThat(identity.email()).isEqualTo("ann@privaterelay.appleid.com");
		assertThat(identity.emailVerified()).isTrue();
	}

	@Test
	void emailVerifiedCanBeABooleanOrAString() throws Exception {
		AppleJwtTokenVerifier verifier = verifier(BUNDLE);
		assertThat(verifier.verify(token(apple, claims().claim("email_verified", "true").build())).emailVerified()).isTrue();
		assertThat(verifier.verify(token(apple, claims().claim("email_verified", "false").build())).emailVerified()).isFalse();
		assertThat(verifier.verify(token(apple, claims().claim("email_verified", false).build())).emailVerified()).isFalse();
		AppleTokenVerifier.AppleIdentity bare = verifier.verify(token(apple, claims().claim("email_verified", null).claim("email", null).build()));
		assertThat(bare.emailVerified()).isFalse();
		assertThat(bare.email()).isNull();
	}

	@Test
	void wrongAudienceIssuerKeyOrExpiryIsRejected() throws Exception {
		AppleJwtTokenVerifier verifier = verifier(BUNDLE);
		Instant now = Instant.now();
		rejected(verifier, token(apple, claims().audience("com.other.app").build()));
		rejected(verifier, token(apple, claims().audience((String) null).build()));
		rejected(verifier, token(apple, claims().issuer("https://accounts.google.com").build()));
		rejected(verifier, token(apple, claims().expirationTime(Date.from(now.minusSeconds(600))).build()));
		rejected(verifier, token(apple, claims().expirationTime(null).build()));
		rejected(verifier, token(stranger, claims().build()));
		String valid = token(apple, claims().build());
		rejected(verifier, valid.substring(0, valid.lastIndexOf('.') + 1));
	}
}
