package com.dropzone.api.jobs;

import com.dropzone.api.common.ApiException;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class GoogleJobTokenVerifier implements JobTokenVerifier {

	private final Map<String, GoogleIdTokenVerifier> verifiers = new ConcurrentHashMap<>();

	@Override
	public Claims verify(String idToken, String audience) {
		GoogleIdTokenVerifier verifier = verifiers.computeIfAbsent(audience,
				aud -> new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
						.setAudience(List.of(aud))
						.setIssuers(JobAuth.ISSUERS)
						.build());
		GoogleIdToken token;
		try {
			token = verifier.verify(idToken);
		}
		catch (Exception e) {
			throw ApiException.unauthorized("Invalid job token");
		}
		if (token == null) {
			throw ApiException.unauthorized("Invalid job token");
		}
		GoogleIdToken.Payload payload = token.getPayload();
		Object aud = payload.getAudience();
		List<String> audiences = aud instanceof Collection<?> values ? values.stream().map(String::valueOf).toList()
				: aud == null ? List.of() : List.of(String.valueOf(aud));
		return new Claims(payload.getIssuer(), audiences, payload.getEmail(), Boolean.TRUE.equals(payload.getEmailVerified()));
	}
}
