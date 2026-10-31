package com.dropzone.api.billing;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface RevenueCatClient {

	Optional<Entitlement> entitlement(String appUserId, String entitlementId);

	void deleteSubscriber(String appUserId);

	boolean cancelPlaySubscription(String appUserId, String storeTransactionId);

	record Entitlement(boolean present, Instant expiresAt, String productId, boolean willRenew, Instant billingIssueAt,
			List<String> renewingPlayTransactions) {

		public Entitlement(boolean present, Instant expiresAt, String productId, boolean willRenew, Instant billingIssueAt) {
			this(present, expiresAt, productId, willRenew, billingIssueAt, List.of());
		}

		public static Entitlement none() {
			return new Entitlement(false, null, null, false, null);
		}

		public boolean lifetime() {
			return present && expiresAt == null && productId != null && productId.startsWith("rc_promo");
		}
	}
}
