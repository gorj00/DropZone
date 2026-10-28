package com.dropzone.api.billing;

import com.dropzone.api.config.AppProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class RevenueCatRestClient implements RevenueCatClient {

	static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
	static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
	private static final Logger log = LoggerFactory.getLogger(RevenueCatRestClient.class);

	private final String apiKey;
	private final RestClient http;

	@Autowired
	public RevenueCatRestClient(AppProperties props) {
		this(props.billing().revenuecatApiKey(), "https://api.revenuecat.com/v1", CONNECT_TIMEOUT, READ_TIMEOUT);
	}

	RevenueCatRestClient(String apiKey, String baseUrl, Duration connectTimeout, Duration readTimeout) {
		this.apiKey = apiKey;
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(connectTimeout);
		factory.setReadTimeout(readTimeout);
		this.http = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
	}

	@Override
	public Optional<Entitlement> entitlement(String appUserId, String entitlementId) {
		if (!configured()) {
			log.info("REVENUECAT_API_KEY not set, skipping entitlement refresh");
			return Optional.empty();
		}
		try {
			SubscriberResponse response = http.get()
					.uri("/subscribers/{id}", appUserId)
					.header("Authorization", "Bearer " + apiKey)
					.retrieve()
					.body(SubscriberResponse.class);
			if (response == null || response.subscriber() == null || response.subscriber().entitlements() == null) {
				return Optional.of(Entitlement.none());
			}
			EntitlementInfo info = response.subscriber().entitlements().get(entitlementId);
			if (info == null) {
				return Optional.of(Entitlement.none());
			}
			return Optional.of(toEntitlement(info, response.subscriber().subscriptions()));
		}
		catch (RestClientException | DateTimeParseException e) {
			log.warn("RevenueCat refresh failed: {}", e.getMessage());
			return Optional.empty();
		}
	}

	@Override
	public void deleteSubscriber(String appUserId) {
		if (!configured()) {
			return;
		}
		try {
			http.delete()
					.uri("/subscribers/{id}", appUserId)
					.header("Authorization", "Bearer " + apiKey)
					.retrieve()
					.toBodilessEntity();
		}
		catch (RestClientException e) {
			log.warn("RevenueCat subscriber delete failed for {}: {}", appUserId, e.getMessage());
		}
	}

	private boolean configured() {
		return apiKey != null && !apiKey.isBlank();
	}

	static Entitlement toEntitlement(EntitlementInfo info, Map<String, SubscriptionInfo> subscriptions) {
		Instant expires = later(parse(info.expiresDate()), parse(info.gracePeriodExpiresDate()));
		SubscriptionInfo sub = subscriptions == null || info.productIdentifier() == null ? null : subscriptions.get(info.productIdentifier());
		if (sub == null) {
			return new Entitlement(true, expires, info.productIdentifier(), false, null);
		}
		Instant billingIssue = parse(sub.billingIssuesDetectedAt());
		boolean willRenew = parse(sub.refundedAt()) == null && (parse(sub.unsubscribeDetectedAt()) == null || billingIssue != null);
		return new Entitlement(true, expires, info.productIdentifier(), willRenew, billingIssue);
	}

	private static Instant parse(String value) {
		return value == null || value.isBlank() ? null : Instant.parse(value);
	}

	private static Instant later(Instant a, Instant b) {
		if (a == null || b == null) {
			return a;
		}
		return b.isAfter(a) ? b : a;
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record SubscriberResponse(Subscriber subscriber) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record Subscriber(Map<String, EntitlementInfo> entitlements, Map<String, SubscriptionInfo> subscriptions) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record EntitlementInfo(@JsonProperty("expires_date") String expiresDate,
			@JsonProperty("grace_period_expires_date") String gracePeriodExpiresDate,
			@JsonProperty("product_identifier") String productIdentifier) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record SubscriptionInfo(@JsonProperty("unsubscribe_detected_at") String unsubscribeDetectedAt,
			@JsonProperty("billing_issues_detected_at") String billingIssuesDetectedAt, @JsonProperty("refunded_at") String refundedAt) {
	}
}
