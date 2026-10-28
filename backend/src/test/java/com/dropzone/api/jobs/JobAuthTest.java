package com.dropzone.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class JobAuthTest {

	private static final JobTokenVerifier ANY = (token, audience) -> new JobTokenVerifier.Claims("https://accounts.google.com",
			List.of(audience), "scheduler@p.iam.gserviceaccount.com", true);

	private static AppProperties props(String audience, String invoker) {
		return new AppProperties(null, null, null, null, null, null, null, null, new AppProperties.Jobs(false, audience, invoker), null,
				null);
	}

	@Test
	void jobsAreClosedUntilAudienceAndInvokerAreSet() {
		assertThatThrownBy(() -> new JobAuth(props("", "scheduler@p.iam.gserviceaccount.com"), ANY).check("Bearer t"))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.FORBIDDEN));
		assertThatThrownBy(() -> new JobAuth(props("https://api/internal/jobs", null), ANY).check("Bearer t"))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.FORBIDDEN));
		new JobAuth(props("https://api/internal/jobs", "scheduler@p.iam.gserviceaccount.com"), ANY).check("Bearer t");
	}

	@Test
	void theGoogleVerifierRejectsTokensItCannotVerify() {
		assertThatThrownBy(() -> new GoogleJobTokenVerifier().verify("not.a.jwt", "https://api/internal/jobs"))
				.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
	}
}
