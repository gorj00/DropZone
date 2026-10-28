package com.dropzone.api.auth;

public interface GoogleTokenVerifier {

	GoogleIdentity verify(String idToken);

	record GoogleIdentity(String subject, String email, boolean emailVerified, String name, String pictureUrl) {
	}
}
