package com.dropzone.api.jobs;

import java.util.List;

public interface JobTokenVerifier {

	Claims verify(String idToken, String audience);

	record Claims(String issuer, List<String> audience, String email, boolean emailVerified) {
	}
}
