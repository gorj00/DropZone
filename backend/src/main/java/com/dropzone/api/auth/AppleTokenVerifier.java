package com.dropzone.api.auth;

public interface AppleTokenVerifier {

	AppleIdentity verify(String idToken);

	record AppleIdentity(String subject, String email, boolean emailVerified) {
	}
}
