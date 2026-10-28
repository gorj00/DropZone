package com.dropzone.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class GoogleApiTokenVerifierTest {

	private static AppProperties props(List<String> clientIds) {
		return new AppProperties(new AppProperties.Auth("x".repeat(32), 7, clientIds, false), null, null, null, null, null, null, null, null,
				null, null);
	}

	@Test
	void missingAudienceMeansGoogleSignInIsOff() {
		GoogleApiTokenVerifier verifier = new GoogleApiTokenVerifier(props(List.of(" ")));
		assertThatThrownBy(() -> verifier.verify("anything")).isInstanceOfSatisfying(ApiException.class, e -> {
			assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
			assertThat(e.getMessage()).isEqualTo("Google sign-in is not configured");
		});
	}

	@Test
	void malformedTokenIsRejected() {
		GoogleApiTokenVerifier verifier = new GoogleApiTokenVerifier(props(List.of("client-1")));
		assertThatThrownBy(() -> verifier.verify("not.a.jwt")).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
	}
}
