package com.dropzone.api.billing;

import java.time.Instant;
import java.util.Optional;

public interface RevenueCatClient {

	Optional<Entitlement> entitlement(String appUserId, String entitlementId);

	void deleteSubscriber(String appUserId);

	record Entitlement(boolean present, Instant expiresAt, String productId, boolean willRenew, Instant billingIssueAt) {

		public static Entitlement none() {
			return new Entitlement(false, null, null, false, null);
		}
	}
}
