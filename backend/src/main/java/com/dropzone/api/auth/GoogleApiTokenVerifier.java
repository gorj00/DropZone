package com.dropzone.api.auth;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class GoogleApiTokenVerifier implements GoogleTokenVerifier {

	private final List<String> audiences;
	private final GoogleIdTokenVerifier verifier;

	public GoogleApiTokenVerifier(AppProperties props) {
		this.audiences = props.auth().googleClientIds() == null ? List.of()
				: props.auth().googleClientIds().stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
		this.verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
				.setAudience(audiences)
				.build();
	}

	@Override
	public GoogleIdentity verify(String idToken) {
		if (audiences.isEmpty()) {
			throw ApiException.unauthorized("Google sign-in is not configured");
		}
		GoogleIdToken token;
		try {
			token = verifier.verify(idToken);
		}
		catch (Exception e) {
			throw ApiException.unauthorized("Invalid Google token");
		}
		if (token == null) {
			throw ApiException.unauthorized("Invalid Google token");
		}
		GoogleIdToken.Payload payload = token.getPayload();
		return new GoogleIdentity(payload.getSubject(), payload.getEmail(), Boolean.TRUE.equals(payload.getEmailVerified()),
				(String) payload.get("name"), (String) payload.get("picture"));
	}
}
