package com.dropzone.api.billing;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RevenueCatEvent(Event event) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Event(String id, String type, @JsonProperty("app_user_id") String appUserId,
			@JsonProperty("original_app_user_id") String originalAppUserId, List<String> aliases,
			@JsonProperty("entitlement_ids") List<String> entitlementIds, @JsonProperty("entitlement_id") String entitlementId,
			@JsonProperty("product_id") String productId, @JsonProperty("new_product_id") String newProductId,
			@JsonProperty("expiration_at_ms") Long expirationAtMs, @JsonProperty("event_timestamp_ms") Long eventTimestampMs,
			@JsonProperty("grace_period_expiration_at_ms") Long gracePeriodExpirationAtMs, @JsonProperty("cancel_reason") String cancelReason,
			String environment, String store, @JsonProperty("transferred_to") List<String> transferredTo,
			@JsonProperty("transferred_from") List<String> transferredFrom) {
	}
}
