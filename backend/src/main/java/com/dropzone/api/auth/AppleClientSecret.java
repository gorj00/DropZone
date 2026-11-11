package com.dropzone.api.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

final class AppleClientSecret {

	static final String AUDIENCE = "https://appleid.apple.com";
	static final Duration TTL = Duration.ofMinutes(30);

	private AppleClientSecret() {
	}

	static ECPrivateKey parseKey(String pem) {
		String body = pem.replace("\\n", "\n")
				.replaceAll("-----[A-Z ]+-----", "")
				.replaceAll("\\s", "");
		try {
			return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(body)));
		}
		catch (Exception e) {
			throw new IllegalArgumentException("APPLE_PRIVATE_KEY is not a PKCS#8 EC private key", e);
		}
	}

	static String sign(String teamId, String keyId, String clientId, ECPrivateKey key, Instant now) {
		JWTClaimsSet claims = new JWTClaimsSet.Builder()
				.issuer(teamId)
				.subject(clientId)
				.audience(AUDIENCE)
				.issueTime(Date.from(now))
				.expirationTime(Date.from(now.plus(TTL)))
				.build();
		SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(), claims);
		try {
			jwt.sign(new ECDSASigner(key));
		}
		catch (JOSEException e) {
			throw new IllegalStateException("Could not sign the Apple client secret", e);
		}
		return jwt.serialize();
	}
}
