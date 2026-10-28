package com.dropzone.api.jobs;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class JobAuth {

	static final List<String> ISSUERS = List.of("https://accounts.google.com", "accounts.google.com");

	private final AppProperties props;
	private final JobTokenVerifier verifier;

	public JobAuth(AppProperties props, JobTokenVerifier verifier) {
		this.props = props;
		this.verifier = verifier;
	}

	public void check(String authorization) {
		AppProperties.Jobs jobs = props.jobs();
		String audience = jobs == null ? null : trim(jobs.audience());
		String invoker = jobs == null ? null : trim(jobs.invoker());
		if (audience == null || invoker == null) {
			throw ApiException.forbidden("Job endpoints are not configured");
		}
		if (authorization == null || !authorization.startsWith("Bearer ") || authorization.substring(7).isBlank()) {
			throw ApiException.unauthorized("Missing job token");
		}
		JobTokenVerifier.Claims claims = verifier.verify(authorization.substring(7).trim(), audience);
		if (!ISSUERS.contains(claims.issuer()) || claims.audience() == null || !claims.audience().contains(audience)) {
			throw ApiException.unauthorized("Invalid job token");
		}
		if (!claims.emailVerified() || claims.email() == null || !claims.email().equalsIgnoreCase(invoker)) {
			throw ApiException.forbidden("This account can't run jobs");
		}
	}

	private static String trim(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
