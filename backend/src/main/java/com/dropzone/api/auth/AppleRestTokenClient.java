package com.dropzone.api.auth;

import com.dropzone.api.config.AppProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.security.interfaces.ECPrivateKey;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class AppleRestTokenClient implements AppleTokenClient {

	static final String BASE_URL = "https://appleid.apple.com";
	static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
	static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
	private static final Logger log = LoggerFactory.getLogger(AppleRestTokenClient.class);

	private final String teamId;
	private final String keyId;
	private final String clientId;
	private final ECPrivateKey key;
	private final Clock clock;
	private final RestClient http;

	@Autowired
	public AppleRestTokenClient(AppProperties props, Clock clock) {
		this(props.auth(), clock, BASE_URL);
	}

	AppleRestTokenClient(AppProperties.Auth auth, Clock clock, String baseUrl) {
		this.teamId = blank(auth.appleTeamId()) ? null : auth.appleTeamId().trim();
		this.keyId = blank(auth.appleKeyId()) ? null : auth.appleKeyId().trim();
		this.clientId = firstClientId(auth.appleClientIds());
		this.key = blank(auth.applePrivateKey()) ? null : AppleClientSecret.parseKey(auth.applePrivateKey());
		this.clock = clock;
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(CONNECT_TIMEOUT);
		factory.setReadTimeout(READ_TIMEOUT);
		this.http = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
	}

	@Override
	public Optional<String> refreshToken(String authorizationCode) {
		if (!configured()) {
			log.info("Apple token exchange skipped: APPLE_TEAM_ID, APPLE_KEY_ID or APPLE_PRIVATE_KEY not set");
			return Optional.empty();
		}
		MultiValueMap<String, String> form = form();
		form.add("grant_type", "authorization_code");
		form.add("code", authorizationCode);
		try {
			TokenResponse response = http.post().uri("/auth/token")
					.contentType(MediaType.APPLICATION_FORM_URLENCODED)
					.body(form)
					.retrieve()
					.body(TokenResponse.class);
			return Optional.ofNullable(response == null ? null : response.refreshToken()).filter(t -> !t.isBlank());
		}
		catch (RestClientException e) {
			log.warn("Apple token exchange failed: {}", e.getMessage());
			return Optional.empty();
		}
	}

	@Override
	public boolean revoke(String refreshToken) {
		if (!configured()) {
			log.info("Apple token revoke skipped: APPLE_TEAM_ID, APPLE_KEY_ID or APPLE_PRIVATE_KEY not set");
			return false;
		}
		MultiValueMap<String, String> form = form();
		form.add("token", refreshToken);
		form.add("token_type_hint", "refresh_token");
		try {
			http.post().uri("/auth/revoke")
					.contentType(MediaType.APPLICATION_FORM_URLENCODED)
					.body(form)
					.retrieve()
					.toBodilessEntity();
			return true;
		}
		catch (RestClientException e) {
			log.warn("Apple token revoke failed: {}", e.getMessage());
			return false;
		}
	}

	private MultiValueMap<String, String> form() {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("client_id", clientId);
		form.add("client_secret", AppleClientSecret.sign(teamId, keyId, clientId, key, clock.instant()));
		return form;
	}

	private boolean configured() {
		return teamId != null && keyId != null && key != null && clientId != null;
	}

	private static String firstClientId(List<String> ids) {
		if (ids == null) {
			return null;
		}
		return ids.stream().map(String::trim).filter(s -> !s.isEmpty()).findFirst().orElse(null);
	}

	private static boolean blank(String value) {
		return value == null || value.isBlank();
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record TokenResponse(@JsonProperty("refresh_token") String refreshToken) {
	}
}
