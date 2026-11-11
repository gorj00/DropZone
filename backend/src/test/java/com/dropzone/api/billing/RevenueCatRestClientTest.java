package com.dropzone.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RevenueCatRestClientTest {

	private HttpServer server;
	private final List<String> requests = new CopyOnWriteArrayList<>();
	private volatile String body = "{}";
	private volatile long delayMs;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/v1/subscribers/", exchange -> {
			requests.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
			try {
				Thread.sleep(delayMs);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
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

	private RevenueCatRestClient client(Duration readTimeout) {
		return new RevenueCatRestClient("sk_test", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", Duration.ofSeconds(1),
				readTimeout);
	}

	@Test
	void readsTheEntitlement() {
		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"2030-01-01T00:00:00Z"}}}}""";
		RevenueCatClient.Entitlement entitlement = client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow();
		assertThat(entitlement.present()).isTrue();
		assertThat(entitlement.expiresAt()).hasToString("2030-01-01T00:00:00Z");
	}

	@Test
	void readsRenewalProductAndBillingIssueFromTheSubscription() {
		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"2030-01-01T00:00:00Z","grace_period_expires_date":"2030-01-04T00:00:00Z",
				 "product_identifier":"dropzone_pro:monthly"}},
				 "subscriptions":{"dropzone_pro:monthly":{"store":"app_store","unsubscribe_detected_at":"2029-12-30T00:00:00Z","billing_issues_detected_at":"2029-12-31T00:00:00Z"}}}}""";
		RevenueCatClient.Entitlement grace = client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow();
		assertThat(grace.expiresAt()).hasToString("2030-01-04T00:00:00Z");
		assertThat(grace.productId()).isEqualTo("dropzone_pro:monthly");
		assertThat(grace.willRenew()).isTrue();
		assertThat(grace.billingIssueAt()).hasToString("2029-12-31T00:00:00Z");
		assertThat(grace.store()).isEqualTo("app_store");

		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"2030-01-01T00:00:00Z","product_identifier":"dropzone_pro:monthly"}},
				 "subscriptions":{"dropzone_pro:monthly":{"unsubscribe_detected_at":"2029-12-30T00:00:00Z"}}}}""";
		assertThat(client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow().willRenew()).isFalse();

		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"2030-01-01T00:00:00Z","product_identifier":"dropzone_pro:monthly"}},
				 "subscriptions":{"dropzone_pro:monthly":{"refunded_at":"2029-12-30T00:00:00Z"}}}}""";
		assertThat(client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow().willRenew()).isFalse();

		body = """
				{"subscriber":{"entitlements":{}}}""";
		assertThat(client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow().present()).isFalse();
	}

	@Test
	void readsALifetimeGrantAsNeverEndingAndListsRenewingPlaySubscriptions() {
		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"2226-09-12T07:42:00Z","product_identifier":"rc_promo_pro_lifetime"}},
				 "subscriptions":{"rc_promo_pro_lifetime":{"store":"promotional","expires_date":"2226-09-12T07:42:00Z"},
				 "pro_monthly":{"store":"play_store","store_transaction_id":"GPA.1","expires_date":"2030-01-01T00:00:00Z"},
				 "pro_weekly":{"store":"play_store","store_transaction_id":"GPA.2","expires_date":"2030-01-01T00:00:00Z","unsubscribe_detected_at":"2026-01-01T00:00:00Z"},
				 "pro_yearly":{"store":"play_store","store_transaction_id":"GPA.3","expires_date":"2020-01-01T00:00:00Z"}}}}""";
		RevenueCatClient.Entitlement e = client(Duration.ofSeconds(2)).entitlement("u1", "pro").orElseThrow();
		assertThat(e.lifetime()).isTrue();
		assertThat(e.expiresAt()).isNull();
		assertThat(e.willRenew()).isFalse();
		assertThat(e.renewingPlayTransactions()).containsExactly("GPA.1");
	}

	@Test
	void hangingServerKeepsTheStoredState() {
		delayMs = 2000;
		long started = System.nanoTime();
		assertThat(client(Duration.ofMillis(300)).entitlement("u1", "pro")).isEmpty();
		assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
	}

	@Test
	void badDateKeepsTheStoredState() {
		body = """
				{"subscriber":{"entitlements":{"pro":{"expires_date":"next tuesday"}}}}""";
		assertThat(client(Duration.ofSeconds(2)).entitlement("u1", "pro")).isEmpty();
	}

	@Test
	void deletesTheSubscriberAndSkipsWithoutKey() {
		client(Duration.ofSeconds(2)).deleteSubscriber("u2");
		new RevenueCatRestClient("", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", Duration.ofSeconds(1),
				Duration.ofSeconds(1)).deleteSubscriber("u3");
		assertThat(requests).containsExactly("DELETE /v1/subscribers/u2");
	}
}
