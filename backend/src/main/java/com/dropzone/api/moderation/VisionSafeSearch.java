package com.dropzone.api.moderation;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class VisionSafeSearch implements SafeSearch {

	static final URI ENDPOINT = URI.create("https://vision.googleapis.com/v1/images:annotate");
	static final String SCOPE = "https://www.googleapis.com/auth/cloud-vision";
	static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
	static final Duration READ_TIMEOUT = Duration.ofSeconds(8);
	static final Duration CREDENTIALS_RETRY = Duration.ofMinutes(5);

	interface CredentialsLoader {
		GoogleCredentials load() throws IOException;
	}

	private final URI endpoint;
	private final CredentialsLoader loader;
	private final RestClient http;
	private final Clock clock;
	private volatile GoogleCredentials credentials;
	private volatile Instant credentialsFailedAt;

	@Autowired
	public VisionSafeSearch(Clock clock) {
		this(ENDPOINT, () -> GoogleCredentials.getApplicationDefault().createScoped(SCOPE), clock);
	}

	VisionSafeSearch(URI endpoint, CredentialsLoader loader, Clock clock) {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(CONNECT_TIMEOUT);
		factory.setReadTimeout(READ_TIMEOUT);
		this.endpoint = endpoint;
		this.loader = loader;
		this.http = RestClient.builder().requestFactory(factory).build();
		this.clock = clock;
	}

	@Override
	public Verdict check(byte[] image) {
		Map<String, List<String>> auth;
		try {
			auth = credentials().getRequestMetadata(endpoint);
		}
		catch (IOException e) {
			throw new IllegalStateException("No Google credentials for Cloud Vision: " + e.getMessage(), e);
		}
		AnnotateResponse response = http.post().uri(endpoint).contentType(MediaType.APPLICATION_JSON)
				.headers(headers -> auth.forEach(headers::addAll))
				.body(new AnnotateRequest(List.of(new ImageRequest(new Image(Base64.getEncoder().encodeToString(image)),
						List.of(new Feature("SAFE_SEARCH_DETECTION"))))))
				.retrieve()
				.body(AnnotateResponse.class);
		if (response == null || response.responses() == null || response.responses().isEmpty()) {
			throw new IllegalStateException("Cloud Vision returned no result");
		}
		ImageResponse result = response.responses().getFirst();
		if (result.error() != null) {
			throw new IllegalStateException("Cloud Vision error " + result.error().code() + ": " + result.error().message());
		}
		if (result.safeSearchAnnotation() == null) {
			throw new IllegalStateException("Cloud Vision returned no SafeSearch annotation");
		}
		return new Verdict(Likelihood.parse(result.safeSearchAnnotation().adult()), Likelihood.parse(result.safeSearchAnnotation().racy()));
	}

	private GoogleCredentials credentials() throws IOException {
		GoogleCredentials current = credentials;
		if (current != null) {
			return current;
		}
		Instant failedAt = credentialsFailedAt;
		if (failedAt != null && clock.instant().isBefore(failedAt.plus(CREDENTIALS_RETRY))) {
			throw new IOException("application default credentials are not available");
		}
		synchronized (this) {
			if (credentials == null) {
				try {
					credentials = loader.load();
					credentialsFailedAt = null;
				}
				catch (IOException e) {
					credentialsFailedAt = clock.instant();
					throw e;
				}
			}
			return credentials;
		}
	}

	record AnnotateRequest(List<ImageRequest> requests) {
	}

	record ImageRequest(Image image, List<Feature> features) {
	}

	record Image(String content) {
	}

	record Feature(String type) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record AnnotateResponse(List<ImageResponse> responses) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record ImageResponse(SafeSearchAnnotation safeSearchAnnotation, Status error) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record SafeSearchAnnotation(String adult, String racy) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Status(Integer code, String message) {
	}
}
