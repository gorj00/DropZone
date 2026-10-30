package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.billing.BillingService;
import com.dropzone.api.billing.RevenueCatClient.Entitlement;
import com.dropzone.api.push.PushType;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class BillingLifecycleIntegrationTest extends IntegrationTest {

	private static final String MONTHLY = "dropzone_pro:monthly";
	private static final String YEARLY = "dropzone_pro:yearly";

	@Autowired
	BillingService billing;

	private void send(String id, String type, Session user, Instant at, Instant expires, String extra) throws Exception {
		String json = """
				{"api_version":"1.0","event":{"id":"%s","type":"%s","app_user_id":"%s","original_app_user_id":"%s","aliases":["%s"],
				 "entitlement_ids":["pro"],"product_id":"%s","period_type":"NORMAL","store":"PLAY_STORE","environment":"SANDBOX",
				 "event_timestamp_ms":%d,"expiration_at_ms":%s%s}}
				""".formatted(id, type, user.id(), user.id(), user.id(), MONTHLY, at.toEpochMilli(),
				expires == null ? "null" : String.valueOf(expires.toEpochMilli()), extra == null ? "" : "," + extra);
		mvc.perform(MockMvcRequestBuilders.post("/api/v1/webhooks/revenuecat").header("Authorization", "Bearer test-secret")
				.contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isOk());
	}

	private String send(String type, Session user, Instant at, Instant expires) throws Exception {
		String id = UUID.randomUUID().toString();
		send(id, type, user, at, expires, null);
		return id;
	}

	private int notifications(Session user, String type) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Integer.class, user.id(), type);
	}

	private String withToken(Session user) throws Exception {
		String token = "token-" + UUID.randomUUID();
		put(user, "/api/v1/me/push-token", "{\"token\":\"%s\"}".formatted(token)).andExpect(status().isNoContent());
		return token;
	}

	private static Instant now() {
		return Instant.now();
	}

	@Test
	void renewalThenAnOlderExpirationKeepsPro() throws Exception {
		Session user = login("OutOfOrder");
		Instant t0 = now().minus(40, ChronoUnit.DAYS);
		send("INITIAL_PURCHASE", user, t0, t0.plus(30, ChronoUnit.DAYS));
		Instant t1 = now().minus(10, ChronoUnit.MINUTES);
		Instant t2 = now().minus(5, ChronoUnit.MINUTES);
		send("RENEWAL", user, t2, now().plus(30, ChronoUnit.DAYS));
		send("EXPIRATION", user, t1, now().minus(10, ChronoUnit.MINUTES));

		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.willRenew").value(true))
				.andExpect(jsonPath("$.proEndPending").value(false));
		assertThat(notifications(user, "PRO_ENDED")).isZero();
	}

	@Test
	void aRepeatedEventIdIsANoOpAndEventsAreLogged() throws Exception {
		Session user = login("Duplicate");
		send("INITIAL_PURCHASE", user, now().minus(2, ChronoUnit.HOURS), now().plus(30, ChronoUnit.DAYS));
		String cancel = UUID.randomUUID().toString();
		send(cancel, "CANCELLATION", user, now().minus(1, ChronoUnit.HOURS), now().plus(30, ChronoUnit.DAYS), "\"cancel_reason\":\"UNSUBSCRIBE\"");
		get(user, "/api/v1/me").andExpect(jsonPath("$.willRenew").value(false)).andExpect(jsonPath("$.pro").value(true));
		send("UNCANCELLATION", user, now().minus(30, ChronoUnit.MINUTES), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.willRenew").value(true));

		send(cancel, "CANCELLATION", user, now(), now().plus(30, ChronoUnit.DAYS), "\"cancel_reason\":\"UNSUBSCRIBE\"");
		get(user, "/api/v1/me").andExpect(jsonPath("$.willRenew").value(true));

		assertThat(jdbc.queryForObject("select count(*) from billing_events where id = ?", Integer.class, cancel)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select environment from billing_events where id = ?", String.class, cancel)).isEqualTo("SANDBOX");
		assertThat(jdbc.queryForObject("select count(*) from billing_events where app_user_id = ?", Integer.class, user.id().toString()))
				.isEqualTo(3);
	}

	@Test
	void restIsTheSourceOfTruthForEveryEvent() throws Exception {
		Session active = login("RestActive");
		Instant renewsAt = now().plus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(active.id(), new Entitlement(true, renewsAt, YEARLY, true, null));
		send("EXPIRATION", active, now(), now().minus(1, ChronoUnit.MINUTES));
		get(active, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.proProductId").value(YEARLY))
				.andExpect(jsonPath("$.proExpiresAt").value(renewsAt.toString()));

		Session none = login("RestNone");
		revenueCat.set(none.id(), Entitlement.none());
		send("INITIAL_PURCHASE", none, now(), now().plus(30, ChronoUnit.DAYS));
		get(none, "/api/v1/me").andExpect(jsonPath("$.pro").value(false));
	}

	@Test
	void billingRefreshWithEntitlementPresentAbsentOrFailing() throws Exception {
		Session user = login("Refresh");
		String token = withToken(user);
		Instant until = now().plus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(user.id(), new Entitlement(true, until, MONTHLY, true, null));
		post(user, "/api/v1/billing/refresh", null).andExpect(jsonPath("$.pro").value(true))
				.andExpect(jsonPath("$.proExpiresAt").value(until.toString())).andExpect(jsonPath("$.willRenew").value(true))
				.andExpect(jsonPath("$.proProductId").value(MONTHLY)).andExpect(jsonPath("$.trialEndPending").value(false));

		revenueCat.unavailable(user.id());
		post(user, "/api/v1/billing/refresh", null).andExpect(jsonPath("$.pro").value(true))
				.andExpect(jsonPath("$.proExpiresAt").value(until.toString()));

		revenueCat.set(user.id(), Entitlement.none());
		post(user, "/api/v1/billing/refresh", null).andExpect(jsonPath("$.pro").value(false))
				.andExpect(jsonPath("$.proEndPending").value(true)).andExpect(jsonPath("$.trialEndPending").value(false));
		assertThat(notifications(user, "PRO_ENDED")).isEqualTo(1);
		assertThat(pushes.toToken(token)).extracting(s -> s.type()).containsExactly(PushType.PRO_ENDED);
		revenueCat.unavailable(user.id());
	}

	@Test
	void billingIssueKeepsProUntilTheGraceEnd() throws Exception {
		Session user = login("Grace");
		String token = withToken(user);
		send("INITIAL_PURCHASE", user, now().minus(31, ChronoUnit.DAYS), now().minus(1, ChronoUnit.DAYS));
		Instant graceEnd = now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
		send(UUID.randomUUID().toString(), "BILLING_ISSUE", user, now().minus(1, ChronoUnit.DAYS), now().minus(1, ChronoUnit.DAYS),
				"\"grace_period_expiration_at_ms\":" + graceEnd.toEpochMilli());
		send(UUID.randomUUID().toString(), "CANCELLATION", user, now().minus(1, ChronoUnit.DAYS), now().minus(1, ChronoUnit.DAYS),
				"\"cancel_reason\":\"BILLING_ERROR\"");

		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.billingIssue").value(true))
				.andExpect(jsonPath("$.proExpiresAt").value(graceEnd.toString()));
		assertThat(notifications(user, "BILLING_ISSUE")).isEqualTo(1);
		assertThat(pushes.toToken(token)).hasSize(1).first().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.BILLING_ISSUE);
			assertThat(push.data()).containsEntry("link",
					"https://play.google.com/store/account/subscriptions?sku=dropzone_pro&package=com.dropzone.app");
		});

		send("RENEWAL", user, now(), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.billingIssue").value(false));
	}

	@Test
	void billingIssueClearsWhenTheSubscriptionExpires() throws Exception {
		Session user = login("Hold");
		send("INITIAL_PURCHASE", user, now().minus(31, ChronoUnit.DAYS), now().plus(1, ChronoUnit.HOURS));
		send("BILLING_ISSUE", user, now().minus(1, ChronoUnit.HOURS), now().plus(1, ChronoUnit.HOURS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.billingIssue").value(true)).andExpect(jsonPath("$.pro").value(true));
		send("EXPIRATION", user, now(), now().minus(1, ChronoUnit.MINUTES));
		get(user, "/api/v1/me").andExpect(jsonPath("$.billingIssue").value(false)).andExpect(jsonPath("$.pro").value(false))
				.andExpect(jsonPath("$.proEndPending").value(true));
	}

	@Test
	void cancellationUncancellationAndProductChangeAreTracked() throws Exception {
		Session user = login("Plans");
		Instant periodEnd = now().plus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MILLIS);
		send("INITIAL_PURCHASE", user, now().minus(3, ChronoUnit.HOURS), periodEnd);
		get(user, "/api/v1/me").andExpect(jsonPath("$.willRenew").value(true)).andExpect(jsonPath("$.proProductId").value(MONTHLY));

		send(UUID.randomUUID().toString(), "CANCELLATION", user, now().minus(2, ChronoUnit.HOURS), periodEnd, "\"cancel_reason\":\"UNSUBSCRIBE\"");
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.willRenew").value(false))
				.andExpect(jsonPath("$.proExpiresAt").value(periodEnd.toString()));

		send("UNCANCELLATION", user, now().minus(1, ChronoUnit.HOURS), periodEnd);
		get(user, "/api/v1/me").andExpect(jsonPath("$.willRenew").value(true));

		send(UUID.randomUUID().toString(), "PRODUCT_CHANGE", user, now(), now().plus(365, ChronoUnit.DAYS),
				"\"new_product_id\":\"" + YEARLY + "\"");
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.proProductId").value(YEARLY))
				.andExpect(jsonPath("$.willRenew").value(true));
	}

	@Test
	void refundEndsProAtOnceWithoutLeeway() throws Exception {
		Session user = login("Refund");
		send("INITIAL_PURCHASE", user, now().minus(2, ChronoUnit.DAYS), now().plus(28, ChronoUnit.DAYS));
		send(UUID.randomUUID().toString(), "CANCELLATION", user, now(), now().minus(1, ChronoUnit.MINUTES), "\"cancel_reason\":\"CUSTOMER_SUPPORT\"");
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.willRenew").value(false))
				.andExpect(jsonPath("$.proEndPending").value(true));
		assertThat(notifications(user, "PRO_ENDED")).isEqualTo(1);
	}

	@Test
	void transferMovesProToTheNewAccount() throws Exception {
		Session from = login("TransferFrom");
		Session to = login("TransferTo");
		send("INITIAL_PURCHASE", from, now().minus(1, ChronoUnit.DAYS), now().plus(29, ChronoUnit.DAYS));
		revenueCat.set(from.id(), Entitlement.none());
		revenueCat.set(to.id(), new Entitlement(true, now().plus(29, ChronoUnit.DAYS), MONTHLY, true, null));
		String json = """
				{"api_version":"1.0","event":{"id":"%s","type":"TRANSFER","transferred_from":["%s"],"transferred_to":["%s"],
				 "event_timestamp_ms":%d,"environment":"SANDBOX"}}
				""".formatted(UUID.randomUUID(), from.id(), to.id(), now().toEpochMilli());
		mvc.perform(MockMvcRequestBuilders.post("/api/v1/webhooks/revenuecat").header("Authorization", "Bearer test-secret")
				.contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isOk());

		get(from, "/api/v1/me").andExpect(jsonPath("$.pro").value(false));
		get(to, "/api/v1/me").andExpect(jsonPath("$.pro").value(true));
		assertThat(notifications(from, "PRO_ENDED")).isEqualTo(1);
		revenueCat.unavailable(from.id());
		revenueCat.unavailable(to.id());
	}

	@Test
	void renewalLeewayKeepsProWhileWillRenewIsTrue() throws Exception {
		Session user = loginTrial("Leeway");
		onboardLose(user, 3, "GYM", "BIKE");
		endTrial(user);
		jdbc.update("update users set pro = true, will_renew = true, pro_expires_at = now() - interval '10 minutes' where id = ?", user.id());

		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.trialEndPending").value(false))
				.andExpect(jsonPath("$.proEndPending").value(false));
		get(user, "/api/v1/today").andExpect(status().isOk());
		get(user, "/api/v1/quests").andExpect(jsonPath("$[*].code", containsInAnyOrder("GYM", "BIKE")));

		jdbc.update("update users set will_renew = false where id = ?", user.id());
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.proEndPending").value(true));
	}

	@Test
	void autoAddedFreeQuestsGoAwayWhenProComesBack() throws Exception {
		Session user = loginTrial("Comeback");
		onboardLose(user, 3, "GYM", "BIKE");
		endTrial(user);
		get(user, "/api/v1/today").andExpect(status().isOk());
		get(user, "/api/v1/quests").andExpect(jsonPath("$", hasSize(5)));
		assertThat(jdbc.queryForObject("select count(*) from user_quests where user_id = ? and auto_free and active", Integer.class, user.id()))
				.isEqualTo(3);

		send("INITIAL_PURCHASE", user, now(), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/quests").andExpect(jsonPath("$[*].code", containsInAnyOrder("GYM", "BIKE")));
		get(user, "/api/v1/today").andExpect(jsonPath("$.quests[*].quest.code", containsInAnyOrder("GYM", "BIKE")));
	}

	@Test
	void freeQuestsTheUserPicksStayAfterResubscribing() throws Exception {
		Session user = loginTrial("Keeper");
		onboardLose(user, 3, "GYM");
		endTrial(user);
		get(user, "/api/v1/today").andExpect(status().isOk());
		put(user, "/api/v1/quests", "{\"codes\":[\"WEIGH_IN\",\"STEPS\"]}").andExpect(status().isOk());

		send("INITIAL_PURCHASE", user, now(), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/quests").andExpect(jsonPath("$[*].code", containsInAnyOrder("WEIGH_IN", "STEPS")));
	}

	@Test
	void expiredSubscribersSeeTheProEndedScreenOnceAndGetWelcomedBack() throws Exception {
		Session user = loginTrial("Lapsed");
		String token = withToken(user);
		send("INITIAL_PURCHASE", user, now().minus(40, ChronoUnit.DAYS), now().minus(10, ChronoUnit.DAYS));
		endTrial(user);
		send("EXPIRATION", user, now().minus(1, ChronoUnit.HOURS), now().minus(10, ChronoUnit.DAYS));

		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.proEndPending").value(true))
				.andExpect(jsonPath("$.trialEndPending").value(false)).andExpect(jsonPath("$.willRenew").value(false));
		assertThat(notifications(user, "PRO_ENDED")).isEqualTo(1);
		assertThat(pushes.to(user.id(), PushType.PRO_ENDED)).singleElement()
				.satisfies(push -> assertThat(push.data()).containsEntry("link", "/paywall").containsEntry("type", "PRO_ENDED"));

		patch(user, "/api/v1/me", "{\"proEndAcknowledged\":true}").andExpect(jsonPath("$.proEndPending").value(false));
		get(user, "/api/v1/me").andExpect(jsonPath("$.proEndPending").value(false));

		send("INITIAL_PURCHASE", user, now(), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.proEndPending").value(false));
		assertThat(notifications(user, "PRO_BACK")).isEqualTo(1);
		assertThat(pushes.toToken(token)).extracting(s -> s.type()).containsExactly(PushType.PRO_ENDED, PushType.PRO_BACK);

		send("EXPIRATION", user, now().plus(1, ChronoUnit.SECONDS), now().minus(1, ChronoUnit.MINUTES));
		get(user, "/api/v1/me").andExpect(jsonPath("$.proEndPending").value(true));
		assertThat(notifications(user, "PRO_ENDED")).isEqualTo(2);
	}

	@Test
	void usersWhoNeverPaidKeepTheTrialWording() throws Exception {
		Session user = login("NeverPaid");
		get(user, "/api/v1/me").andExpect(jsonPath("$.trialEndPending").value(true)).andExpect(jsonPath("$.proEndPending").value(false))
				.andExpect(jsonPath("$.billingIssue").value(false)).andExpect(jsonPath("$.willRenew").value(false))
				.andExpect(jsonPath("$.proProductId").doesNotExist());
	}

	@Test
	void meRefreshesFromRevenueCatAroundTheExpiryAtMostEveryTenMinutes() throws Exception {
		Session user = login("Resume");
		jdbc.update("update users set pro = true, will_renew = true, pro_expires_at = now() - interval '1 day' where id = ?", user.id());
		Instant renewed = now().plus(30, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(user.id(), new Entitlement(true, renewed, MONTHLY, true, null));

		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.proExpiresAt").value(renewed.toString()));
		assertThat(revenueCat.calls(user.id())).isEqualTo(1);

		jdbc.update("update users set pro_expires_at = now() + interval '30 minutes' where id = ?", user.id());
		get(user, "/api/v1/me").andExpect(status().isOk());
		assertThat(revenueCat.calls(user.id())).isEqualTo(1);

		Session far = login("FarFromExpiry");
		jdbc.update("update users set pro = true, will_renew = true, pro_expires_at = now() + interval '10 days' where id = ?", far.id());
		get(far, "/api/v1/me").andExpect(jsonPath("$.pro").value(true));
		assertThat(revenueCat.calls(far.id())).isZero();
		revenueCat.unavailable(user.id());
	}

	@Test
	void reconciliationRefreshesSubscriptionsAroundTheirExpiry() throws Exception {
		Session missed = login("MissedRenewal");
		jdbc.update("update users set pro = true, will_renew = true, pro_expires_at = now() - interval '2 days' where id = ?", missed.id());
		Instant renewed = now().plus(28, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(missed.id(), new Entitlement(true, renewed, MONTHLY, true, null));

		assertThat(billing.reconcile().get("refreshed")).isGreaterThanOrEqualTo(1);
		assertThat(jdbc.queryForObject("select pro_expires_at from users where id = ?", Timestamp.class, missed.id()).toInstant())
				.isEqualTo(renewed);
		assertThat(revenueCat.calls(missed.id())).isEqualTo(1);
		revenueCat.unavailable(missed.id());
	}

	@Test
	void restRefreshNoticesABillingIssue() throws Exception {
		Session user = login("RestGrace");
		Instant grace = now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(user.id(), new Entitlement(true, grace, MONTHLY, true, now().minus(1, ChronoUnit.HOURS)));
		String body = body(post(user, "/api/v1/billing/refresh", null).andExpect(jsonPath("$.billingIssue").value(true))
				.andExpect(jsonPath("$.pro").value(true)));
		assertThat((String) JsonPath.read(body, "$.proExpiresAt")).isEqualTo(grace.toString());
		post(user, "/api/v1/billing/refresh", null).andExpect(status().isOk());
		assertThat(notifications(user, "BILLING_ISSUE")).isEqualTo(1);
		revenueCat.unavailable(user.id());
	}

	@Test
	void accountHoldPausesProAndComesBackWhenThePaymentIsFixed() throws Exception {
		Session user = login("OnHold");
		String token = withToken(user);
		revenueCat.set(user.id(), new Entitlement(true, now().plus(20, ChronoUnit.DAYS), MONTHLY, true, null));
		send("INITIAL_PURCHASE", user, now().minus(40, ChronoUnit.DAYS), now().plus(20, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.billingHold").value(false));

		revenueCat.set(user.id(), new Entitlement(true, now().minus(2, ChronoUnit.DAYS), MONTHLY, true, now().minus(9, ChronoUnit.DAYS)));
		send("EXPIRATION", user, now().minus(1, ChronoUnit.MINUTES), now().minus(2, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.billingHold").value(true))
				.andExpect(jsonPath("$.billingIssue").value(false)).andExpect(jsonPath("$.proEndPending").value(true));
		assertThat(notifications(user, "PRO_ENDED")).isZero();
		assertThat(notifications(user, "BILLING_ISSUE")).isEqualTo(1);
		assertThat(pushes.toToken(token)).singleElement().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.BILLING_ISSUE);
			assertThat(push.data()).containsEntry("link", "https://play.google.com/store/account/subscriptions?sku=dropzone_pro&package=com.dropzone.app");
		});

		revenueCat.set(user.id(), new Entitlement(true, now().plus(30, ChronoUnit.DAYS), MONTHLY, true, null));
		send("RENEWAL", user, now(), now().plus(30, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.billingHold").value(false))
				.andExpect(jsonPath("$.proEndPending").value(false));
		assertThat(notifications(user, "PRO_BACK")).isEqualTo(1);
		revenueCat.unavailable(user.id());
	}

	@Test
	void aHoldThatRanOutEndsLikeAnyExpiredSubscription() throws Exception {
		Session user = login("HoldOver");
		revenueCat.set(user.id(), new Entitlement(true, now().plus(20, ChronoUnit.DAYS), MONTHLY, true, null));
		send("INITIAL_PURCHASE", user, now().minus(90, ChronoUnit.DAYS), now().plus(20, ChronoUnit.DAYS));
		revenueCat.set(user.id(), new Entitlement(true, now().minus(61, ChronoUnit.DAYS), MONTHLY, true, now().minus(70, ChronoUnit.DAYS)));
		send("EXPIRATION", user, now().minus(1, ChronoUnit.MINUTES), now().minus(61, ChronoUnit.DAYS));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.billingHold").value(false))
				.andExpect(jsonPath("$.proEndPending").value(true));
		assertThat(notifications(user, "PRO_ENDED")).isEqualTo(1);
		revenueCat.unavailable(user.id());
	}

	@Test
	void aLifetimeGrantIsProWithoutAnExpiry() throws Exception {
		Session user = login("Lifetime");
		revenueCat.set(user.id(), new Entitlement(true, null, "rc_promo_pro_lifetime", false, null));
		post(user, "/api/v1/billing/refresh", null).andExpect(jsonPath("$.pro").value(true))
				.andExpect(jsonPath("$.proExpiresAt").doesNotExist()).andExpect(jsonPath("$.billingHold").value(false))
				.andExpect(jsonPath("$.proEndPending").value(false)).andExpect(jsonPath("$.trial").value(false));
		assertThat(notifications(user, "PRO_ENDED")).isZero();
		revenueCat.unavailable(user.id());
	}
}
