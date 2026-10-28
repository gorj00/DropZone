package com.dropzone.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.moderation.SafeSearch.Likelihood;
import com.dropzone.api.moderation.SafeSearch.Verdict;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VisionSafeSearchTest {

	private HttpServer server;
	private final List<String> bodies = new CopyOnWriteArrayList<>();
	private final List<String> auth = new CopyOnWriteArrayList<>();
	private volatile String response = "{}";

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v1/images:annotate", exchange -> {
			bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
			auth.add(exchange.getRequestHeaders().getFirst("Authorization"));
			byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, bytes.length);
			exchange.getResponseBody().write(bytes);
			exchange.close();
		});
		server.start();
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private VisionSafeSearch client(VisionSafeSearch.CredentialsLoader loader) {
		return new VisionSafeSearch(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1/images:annotate"), loader,
				Clock.systemUTC());
	}

	private static GoogleCredentials token() {
		return GoogleCredentials.create(new AccessToken("vision-token", Date.from(Instant.now().plusSeconds(3600))));
	}

	@Test
	void sendsTheImageForSafeSearchAndReadsAdultAndRacy() {
		response = """
				{"responses":[{"safeSearchAnnotation":{"adult":"LIKELY","spoof":"UNLIKELY","medical":"VERY_UNLIKELY","violence":"UNLIKELY",
				"racy":"VERY_LIKELY"}}]}""";
		byte[] image = { 1, 2, 3, 4 };
		Verdict verdict = client(VisionSafeSearchTest::token).check(image);

		assertThat(verdict).isEqualTo(new Verdict(Likelihood.LIKELY, Likelihood.VERY_LIKELY));
		assertThat(verdict.flagged()).isTrue();
		assertThat(auth).containsExactly("Bearer vision-token");
		String body = bodies.getFirst();
		assertThat((String) JsonPath.read(body, "$.requests[0].image.content")).isEqualTo(Base64.getEncoder().encodeToString(image));
		assertThat((String) JsonPath.read(body, "$.requests[0].features[0].type")).isEqualTo("SAFE_SEARCH_DETECTION");
	}

	@Test
	void possibleIsNotFlaggedAndUnknownValuesReadAsUnknown() {
		response = """
				{"responses":[{"safeSearchAnnotation":{"adult":"POSSIBLE","racy":"SOMETHING_NEW"}}]}""";
		Verdict verdict = client(VisionSafeSearchTest::token).check(new byte[] { 9 });
		assertThat(verdict).isEqualTo(new Verdict(Likelihood.POSSIBLE, Likelihood.UNKNOWN));
		assertThat(verdict.flagged()).isFalse();
	}

	@Test
	void errorsAndMissingCredentialsThrowAndCredentialFailuresAreNotRetriedAtOnce() {
		response = """
				{"responses":[{"error":{"code":3,"message":"Bad image data."}}]}""";
		assertThatThrownBy(() -> client(VisionSafeSearchTest::token).check(new byte[] { 1 })).hasMessageContaining("Bad image data.");

		AtomicInteger loads = new AtomicInteger();
		VisionSafeSearch noCredentials = client(() -> {
			loads.incrementAndGet();
			throw new IOException("no ADC");
		});
		assertThatThrownBy(() -> noCredentials.check(new byte[] { 1 })).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> noCredentials.check(new byte[] { 1 })).isInstanceOf(IllegalStateException.class);
		assertThat(loads).hasValue(1);
		assertThat(bodies).hasSize(1);
	}
}
