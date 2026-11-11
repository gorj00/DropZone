package com.dropzone.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class AppleClientSecretTest {

	private static KeyPair keyPair() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
		generator.initialize(new ECGenParameterSpec("secp256r1"));
		return generator.generateKeyPair();
	}

	private static String pem(KeyPair pair) {
		String body = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(pair.getPrivate().getEncoded());
		return "-----BEGIN PRIVATE KEY-----\n" + body + "\n-----END PRIVATE KEY-----\n";
	}

	@Test
	void parsesTheP8KeyWithRealAndEscapedLineBreaks() throws Exception {
		KeyPair pair = keyPair();
		assertThat(AppleClientSecret.parseKey(pem(pair)).getS()).isEqualTo(((ECPrivateKey) pair.getPrivate()).getS());
		assertThat(AppleClientSecret.parseKey(pem(pair).replace("\n", "\\n")).getS()).isEqualTo(((ECPrivateKey) pair.getPrivate()).getS());
		assertThatThrownBy(() -> AppleClientSecret.parseKey("not a key")).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void signsAClientSecretAppleAccepts() throws Exception {
		KeyPair pair = keyPair();
		Instant now = Instant.parse("2026-11-07T10:00:00Z");
		String secret = AppleClientSecret.sign("TEAM123", "KEY456", "com.dropzone.app", (ECPrivateKey) pair.getPrivate(), now);

		SignedJWT jwt = SignedJWT.parse(secret);
		assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) pair.getPublic()))).isTrue();
		assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("ES256");
		assertThat(jwt.getHeader().getKeyID()).isEqualTo("KEY456");
		assertThat(jwt.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM123");
		assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("com.dropzone.app");
		assertThat(jwt.getJWTClaimsSet().getAudience()).containsExactly("https://appleid.apple.com");
		assertThat(jwt.getJWTClaimsSet().getIssueTime().toInstant()).isEqualTo(now);
		assertThat(jwt.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(now.plus(AppleClientSecret.TTL));
	}
}
