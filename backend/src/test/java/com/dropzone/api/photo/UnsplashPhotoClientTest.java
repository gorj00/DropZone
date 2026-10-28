package com.dropzone.api.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.PhotoDto;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class UnsplashPhotoClientTest {

	private static final String SEARCH = "https://api.unsplash.com/search/photos?query=%s&per_page=12&orientation=squarish&content_filter=high";

	private final RestClient.Builder builder = RestClient.builder();
	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
	private final MutableClock clock = new MutableClock();
	private final UnsplashPhotoClient client = new UnsplashPhotoClient("key-1", builder, clock);

	@Test
	void mapsResultsAndSendsKey() {
		server.expect(requestTo(SEARCH.formatted("rock%20%26%20roll")))
				.andExpect(header("Authorization", "Client-ID key-1"))
				.andExpect(header("Accept-Version", "v1"))
				.andRespond(withSuccess("""
						{"results":[
						  {"id":"p1","urls":{"small":"https://s/1","regular":"https://r/1"},"user":{"name":"Ann","links":{"html":"https://unsplash.com/@ann"}}},
						  {"id":"p2","urls":null}
						]}""", MediaType.APPLICATION_JSON));

		List<PhotoDto> photos = client.search("rock & roll");

		assertThat(photos).hasSize(1);
		assertThat(photos.getFirst().id()).isEqualTo("p1");
		assertThat(photos.getFirst().url()).isEqualTo("https://r/1");
		assertThat(photos.getFirst().thumb()).isEqualTo("https://s/1");
		assertThat(photos.getFirst().credit().link()).isEqualTo("https://unsplash.com/@ann");
		server.verify();
	}

	@Test
	void rateLimitBecomesFriendlyError() {
		server.expect(requestTo(SEARCH.formatted("shoes"))).andRespond(withStatus(HttpStatus.FORBIDDEN).body("Rate Limit Exceeded"));
		assertThatThrownBy(() -> client.search("shoes")).isInstanceOfSatisfying(ApiException.class, e -> {
			assertThat(e.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
			assertThat(e.code()).isEqualTo("PHOTO_SEARCH_LIMIT");
		});
	}

	@Test
	void serverErrorAndBadKeyBecomeErrors() {
		server.expect(requestTo(SEARCH.formatted("bike"))).andRespond(withServerError());
		server.expect(requestTo(SEARCH.formatted("bike"))).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
		assertThatThrownBy(() -> client.search("bike")).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo("PHOTO_SEARCH_FAILED"));
		assertThatThrownBy(() -> client.search("bike")).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo("PHOTO_SEARCH_OFF"));
	}

	@Test
	void missingKeyTurnsSearchOff() {
		UnsplashPhotoClient off = new UnsplashPhotoClient(" ", RestClient.builder(), clock);
		assertThatThrownBy(() -> off.search("shoes")).isInstanceOfSatisfying(ApiException.class, e -> {
			assertThat(e.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
			assertThat(e.code()).isEqualTo("PHOTO_SEARCH_OFF");
		});
		off.trackDownload("p1");
	}

	@Test
	void trackDownloadHitsUnsplashAndIgnoresFailures() {
		server.expect(requestTo("https://api.unsplash.com/photos/p1/download")).andRespond(withSuccess());
		server.expect(requestTo("https://api.unsplash.com/photos/p2/download")).andRespond(withServerError());
		client.trackDownload("p1");
		client.trackDownload("p2");
		server.verify();
	}

	@Test
	void searchesAreCachedPerNormalisedQueryForAnHour() {
		server.expect(once(), requestTo(SEARCH.formatted("red%20shoes"))).andRespond(withSuccess("""
				{"results":[{"id":"p1","urls":{"small":"https://s/1","regular":"https://r/1"}}]}""", MediaType.APPLICATION_JSON));
		assertThat(client.search("Red  Shoes")).hasSize(1);
		assertThat(client.search(" red shoes ")).hasSize(1);
		server.verify();

		server.reset();
		clock.advance(UnsplashPhotoClient.CACHE_TTL.plusSeconds(1));
		server.expect(once(), requestTo(SEARCH.formatted("red%20shoes"))).andRespond(withSuccess("""
				{"results":[]}""", MediaType.APPLICATION_JSON));
		assertThat(client.search("red shoes")).isEmpty();
		server.verify();
	}

	static final class MutableClock extends Clock {

		private Instant now = Instant.parse("2026-01-01T10:00:00Z");

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public ZoneOffset getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}
}
