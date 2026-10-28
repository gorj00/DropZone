package com.dropzone.api.photo;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.PhotoCredit;
import com.dropzone.api.common.Dtos.PhotoDto;
import com.dropzone.api.config.AppProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class UnsplashPhotoClient implements PhotoClient {

	static final Duration CACHE_TTL = Duration.ofHours(1);
	static final int CACHE_SIZE = 500;
	private static final Logger log = LoggerFactory.getLogger(UnsplashPhotoClient.class);

	private final String accessKey;
	private final RestClient http;
	private final Clock clock;
	private final Map<String, Cached> cache = new ConcurrentHashMap<>();

	@Autowired
	public UnsplashPhotoClient(AppProperties props, Clock clock) {
		this(props.photos().unsplashAccessKey(), RestClient.builder().requestFactory(timeouts()), clock);
	}

	UnsplashPhotoClient(String accessKey, RestClient.Builder builder, Clock clock) {
		this.accessKey = accessKey;
		this.clock = clock;
		this.http = builder.baseUrl("https://api.unsplash.com")
				.defaultHeader("Authorization", "Client-ID " + accessKey)
				.defaultHeader("Accept-Version", "v1")
				.build();
	}

	private static SimpleClientHttpRequestFactory timeouts() {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(3));
		factory.setReadTimeout(Duration.ofSeconds(8));
		return factory;
	}

	@Override
	public List<PhotoDto> search(String rawQuery) {
		if (!configured()) {
			log.info("UNSPLASH_ACCESS_KEY not set, photo search is off");
			throw off();
		}
		String query = normalize(rawQuery);
		Instant now = clock.instant();
		Cached hit = cache.get(query);
		if (hit != null && hit.expiresAt().isAfter(now)) {
			return hit.photos();
		}
		List<PhotoDto> photos = fetch(query);
		if (cache.size() >= CACHE_SIZE) {
			cache.values().removeIf(c -> !c.expiresAt().isAfter(now));
			if (cache.size() >= CACHE_SIZE) {
				cache.clear();
			}
		}
		cache.put(query, new Cached(photos, now.plus(CACHE_TTL)));
		return photos;
	}

	static String normalize(String query) {
		return query.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
	}

	private List<PhotoDto> fetch(String query) {
		try {
			SearchResponse response = http.get()
					.uri("/search/photos?query={q}&per_page=12&orientation=squarish&content_filter=high", query)
					.retrieve()
					.body(SearchResponse.class);
			if (response == null || response.results() == null) {
				return List.of();
			}
			return response.results().stream().map(UnsplashPhotoClient::toDto).filter(Objects::nonNull).toList();
		}
		catch (HttpClientErrorException e) {
			int status = e.getStatusCode().value();
			if (status == 403 || status == 429) {
				log.warn("Unsplash rate limit reached");
				throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "PHOTO_SEARCH_LIMIT",
						"Too many photo searches right now. Try again in a few minutes or upload your own photo.");
			}
			if (status == 401) {
				log.error("Unsplash rejected the access key");
				throw off();
			}
			log.warn("Unsplash search failed: {}", e.getMessage());
			throw failed();
		}
		catch (RestClientException e) {
			log.warn("Unsplash search failed: {}", e.getMessage());
			throw failed();
		}
	}

	@Override
	public void trackDownload(String photoId) {
		if (!configured()) {
			return;
		}
		try {
			http.get().uri("/photos/{id}/download", photoId).retrieve().toBodilessEntity();
		}
		catch (RestClientException e) {
			log.warn("Unsplash download tracking failed: {}", e.getMessage());
		}
	}

	private boolean configured() {
		return accessKey != null && !accessKey.isBlank();
	}

	private static ApiException off() {
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PHOTO_SEARCH_OFF",
				"Photo search isn't available right now. Upload your own photo instead.");
	}

	private static ApiException failed() {
		return new ApiException(HttpStatus.BAD_GATEWAY, "PHOTO_SEARCH_FAILED",
				"Photo search isn't working right now. Try again or upload your own photo.");
	}

	private static PhotoDto toDto(Photo p) {
		if (p.id() == null || p.urls() == null || p.urls().regular() == null) {
			return null;
		}
		PhotoCredit credit = p.user() == null || p.user().links() == null ? null
				: new PhotoCredit(p.user().name(), p.user().links().html());
		return new PhotoDto(p.id(), p.urls().regular(), p.urls().small() == null ? p.urls().regular() : p.urls().small(), credit);
	}

	private record Cached(List<PhotoDto> photos, Instant expiresAt) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record SearchResponse(List<Photo> results) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Photo(String id, Urls urls, Author user) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Urls(String small, String regular) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Author(String name, Links links) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Links(String html) {
	}
}
