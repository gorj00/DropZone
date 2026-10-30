package com.dropzone.api.billing;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.UserDto;
import com.dropzone.api.common.Tally;
import com.dropzone.api.config.AppProperties;
import com.dropzone.api.domain.BillingEventRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.quest.QuestService;
import com.dropzone.api.user.UserService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class BillingService {

	static final Duration REFRESH_EVERY = Duration.ofMinutes(10);
	static final Duration REFRESH_BEFORE_EXPIRY = Duration.ofHours(1);
	static final Duration REFRESH_AFTER_EXPIRY = Duration.ofDays(7);
	static final Duration RECONCILE_BEFORE_EXPIRY = Duration.ofDays(1);
	static final Duration RECONCILE_AFTER_EXPIRY = Duration.ofDays(3);
	static final Duration HOLD_MAX = Duration.ofDays(60);
	static final String PLAY_PACKAGE = "com.dropzone.app";
	public static final String PAYWALL = "/paywall";

	private static final Logger log = LoggerFactory.getLogger(BillingService.class);
	private static final Set<String> GRANTS = Set.of("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION",
			"NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT");
	private static final Set<String> RENEWING = Set.of("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION");

	private final UserRepository users;
	private final UserService userService;
	private final RevenueCatClient revenueCat;
	private final BillingEventRepository events;
	private final QuestService quests;
	private final NotificationService notifications;
	private final PushService push;
	private final AppProperties props;
	private final Clock clock;
	private final TransactionTemplate tx;

	public BillingService(UserRepository users, UserService userService, RevenueCatClient revenueCat, BillingEventRepository events,
			QuestService quests, NotificationService notifications, PushService push, AppProperties props, Clock clock,
			TransactionTemplate tx) {
		this.users = users;
		this.userService = userService;
		this.revenueCat = revenueCat;
		this.events = events;
		this.quests = quests;
		this.notifications = notifications;
		this.push = push;
		this.props = props;
		this.clock = clock;
		this.tx = tx;
	}

	public UserDto refresh(UUID userId) {
		User user = userService.get(userId);
		Optional<RevenueCatClient.Entitlement> entitlement = revenueCat.entitlement(user.id.toString(), entitlement());
		return tx.execute(status -> {
			User fresh = userService.lock(userId);
			Instant now = clock.instant();
			fresh.proRefreshedAt = now;
			entitlement.ifPresent(e -> update(fresh, now, () -> applyEntitlement(fresh, e, now, null)));
			return userService.toDto(fresh);
		});
	}

	public void refreshIfDue(UUID userId) {
		User user = users.findById(userId).orElse(null);
		if (user == null || !user.pro || user.proExpiresAt == null) {
			return;
		}
		Instant now = clock.instant();
		if (user.proExpiresAt.isAfter(now.plus(REFRESH_BEFORE_EXPIRY)) || user.proExpiresAt.isBefore(now.minus(REFRESH_AFTER_EXPIRY))) {
			return;
		}
		Integer claimed = tx.execute(status -> users.claimProRefresh(userId, now, now.minus(REFRESH_EVERY)));
		if (claimed != null && claimed > 0) {
			refresh(userId);
		}
	}

	public Tally reconcile() {
		Instant now = clock.instant();
		List<UUID> ids = users.findProExpiringBetween(now.minus(RECONCILE_AFTER_EXPIRY), now.plus(RECONCILE_BEFORE_EXPIRY));
		int refreshed = 0;
		int failed = 0;
		for (UUID id : ids) {
			try {
				refresh(id);
				refreshed++;
			}
			catch (RuntimeException e) {
				failed++;
				log.warn("Billing reconciliation failed for user {}: {}", id, e.getMessage());
			}
		}
		return new Tally().add("users", ids.size()).add("refreshed", refreshed).add("failed", failed);
	}

	public void checkSecret(String authorization) {
		String secret = props.billing().revenuecatWebhookSecret();
		if (secret == null || secret.isBlank() || authorization == null) {
			throw ApiException.unauthorized("Invalid webhook secret");
		}
		String provided = authorization.startsWith("Bearer ") ? authorization.substring(7) : authorization;
		if (!MessageDigest.isEqual(provided.trim().getBytes(StandardCharsets.UTF_8), secret.trim().getBytes(StandardCharsets.UTF_8))) {
			throw ApiException.unauthorized("Invalid webhook secret");
		}
	}

	public void handle(RevenueCatEvent payload) {
		RevenueCatEvent.Event event = payload == null ? null : payload.event();
		if (event == null || event.type() == null || "TEST".equals(event.type())) {
			return;
		}
		if (!forEntitlement(event)) {
			return;
		}
		if (event.id() != null && events.existsById(event.id())) {
			log.info("RevenueCat event {} ({}) already processed", event.id(), event.type());
			return;
		}
		if ("TRANSFER".equals(event.type())) {
			ids(event.transferredFrom()).forEach(this::refreshQuietly);
			ids(event.transferredTo()).forEach(this::refreshQuietly);
			tx.executeWithoutResult(status -> record(event));
			return;
		}
		Optional<UUID> userId = findUser(event);
		if (userId.isEmpty()) {
			log.info("RevenueCat {} for unknown app user {}", event.type(), event.appUserId());
			tx.executeWithoutResult(status -> record(event));
			return;
		}
		Optional<RevenueCatClient.Entitlement> current = revenueCat.entitlement(userId.get().toString(), entitlement());
		tx.executeWithoutResult(status -> {
			if (!record(event)) {
				return;
			}
			User user = userService.lock(userId.get());
			Instant now = clock.instant();
			Instant at = instant(event.eventTimestampMs());
			update(user, now, () -> {
				if (current.isPresent()) {
					applyEntitlement(user, current.get(), now, event.type());
				}
				else if (at != null && user.billingEventAt != null && at.isBefore(user.billingEventAt)) {
					log.info("RevenueCat {} {} is older than the last applied event, ignored", event.type(), event.id());
				}
				else {
					applyEvent(user, event, now);
				}
				if (at != null && (user.billingEventAt == null || at.isAfter(user.billingEventAt))) {
					user.billingEventAt = at;
				}
			});
		});
	}

	private boolean record(RevenueCatEvent.Event event) {
		if (event.id() == null) {
			return true;
		}
		return events.record(event.id(), event.type(), event.appUserId(), event.environment(), clock.instant()) > 0;
	}

	private void applyEntitlement(User user, RevenueCatClient.Entitlement e, Instant now, String eventType) {
		boolean willRenew = e.present() && e.willRenew();
		boolean hold = willRenew && e.billingIssueAt() != null && e.expiresAt() != null && now.isBefore(e.expiresAt().plus(HOLD_MAX));
		if ("EXPIRATION".equals(eventType) && e.expiresAt() != null && !e.expiresAt().isAfter(now)) {
			willRenew = false;
		}
		user.pro = e.present() && User.active(e.expiresAt(), willRenew, now);
		user.proExpiresAt = e.present() ? e.expiresAt() : null;
		user.willRenew = user.pro && willRenew;
		user.billingHold = hold && !user.pro;
		if (e.productId() != null) {
			user.proProductId = e.productId();
		}
		if (!user.pro || e.billingIssueAt() == null) {
			user.billingIssueAt = null;
		}
		else if (user.billingIssueAt == null) {
			user.billingIssueAt = e.billingIssueAt();
		}
	}

	private void applyEvent(User user, RevenueCatEvent.Event event, Instant now) {
		Instant expires = instant(event.expirationAtMs());
		String type = event.type();
		if (GRANTS.contains(type)) {
			user.pro = true;
			user.proExpiresAt = expires;
			String product = event.newProductId() != null ? event.newProductId() : event.productId();
			if (product != null) {
				user.proProductId = product;
			}
			user.billingHold = false;
			if (RENEWING.contains(type)) {
				user.willRenew = true;
				user.billingIssueAt = null;
			}
			else if ("NON_RENEWING_PURCHASE".equals(type)) {
				user.willRenew = false;
			}
			return;
		}
		switch (type) {
			case "BILLING_ISSUE" -> billingIssue(user, event, now);
			case "CANCELLATION" -> {
				if ("BILLING_ERROR".equals(event.cancelReason())) {
					billingIssue(user, event, now);
				}
				else {
					user.willRenew = false;
					user.proExpiresAt = expires;
					if (expires != null && !expires.isAfter(now)) {
						user.pro = false;
					}
				}
			}
			case "EXPIRATION" -> {
				user.pro = false;
				user.proExpiresAt = expires;
				user.willRenew = false;
				user.billingIssueAt = null;
				user.billingHold = false;
			}
			default -> {
			}
		}
	}

	private void billingIssue(User user, RevenueCatEvent.Event event, Instant now) {
		if (user.billingIssueAt == null) {
			Instant at = instant(event.eventTimestampMs());
			user.billingIssueAt = at == null ? now : at;
		}
		Instant grace = instant(event.gracePeriodExpirationAtMs());
		if (grace != null && grace.isAfter(now)) {
			if (!user.pro || (user.proExpiresAt != null && user.proExpiresAt.isBefore(grace))) {
				user.proExpiresAt = grace;
			}
			user.pro = true;
		}
	}

	private void update(User user, Instant now, Runnable change) {
		boolean wasPro = user.pro;
		boolean endedBefore = user.proEndedAt != null;
		Instant issueBefore = user.billingIssueAt;
		change.run();
		if (wasPro && !user.pro && user.proEndedAt == null) {
			user.proEndedAt = user.proExpiresAt != null && user.proExpiresAt.isBefore(now) ? user.proExpiresAt : now;
			if (user.billingHold) {
				message(user, NotificationType.BILLING_ISSUE, PushType.BILLING_ISSUE, "PRO is on hold",
						"Google Play couldn't charge you, so PRO is paused. Fix your payment in Google Play and PRO comes back on its own.",
						Map.of("link", playSubscriptionUrl(user.proProductId)));
			}
			else {
				message(user, NotificationType.PRO_ENDED, PushType.PRO_ENDED, "Your PRO subscription ended",
						"You're on Free now. Your PRO settings are saved and come back when you resubscribe.", Map.of("link", PAYWALL));
			}
		}
		boolean subscribed = user.isSubscribed(now);
		if (endedBefore && subscribed) {
			user.proEndedAt = null;
			message(user, NotificationType.PRO_BACK, PushType.PRO_BACK, "Welcome back to PRO",
					"Your PRO quests, locks and community features are back.", Map.of());
		}
		if (issueBefore == null && user.billingIssueAt != null) {
			message(user, NotificationType.BILLING_ISSUE, PushType.BILLING_ISSUE, "Payment problem",
					"Google Play couldn't renew DropZone PRO. Update your payment method to keep PRO.",
					Map.of("link", playSubscriptionUrl(user.proProductId)));
		}
		if (subscribed) {
			user.proEndAckAt = null;
			quests.dropAutoFreeQuests(user);
		}
	}

	private void message(User user, NotificationType type, PushType pushType, String title, String body, Map<String, String> data) {
		notifications.notify(user.id, type, null, null, null, null, body);
		push.notify(user, pushType, title, body, data);
	}

	public static String playSubscriptionUrl(String productId) {
		String base = "https://play.google.com/store/account/subscriptions?";
		if (productId == null || productId.isBlank()) {
			return base + "package=" + PLAY_PACKAGE;
		}
		String sku = productId.contains(":") ? productId.substring(0, productId.indexOf(':')) : productId;
		return base + "sku=" + URLEncoder.encode(sku, StandardCharsets.UTF_8) + "&package=" + PLAY_PACKAGE;
	}

	private boolean forEntitlement(RevenueCatEvent.Event event) {
		List<String> ids = new ArrayList<>();
		if (event.entitlementIds() != null) {
			ids.addAll(event.entitlementIds());
		}
		if (event.entitlementId() != null) {
			ids.add(event.entitlementId());
		}
		return ids.isEmpty() || ids.contains(entitlement());
	}

	private Optional<UUID> findUser(RevenueCatEvent.Event event) {
		List<String> candidates = new ArrayList<>();
		candidates.add(event.appUserId());
		candidates.add(event.originalAppUserId());
		if (event.aliases() != null) {
			candidates.addAll(event.aliases());
		}
		for (UUID id : ids(candidates)) {
			if (users.existsById(id)) {
				return Optional.of(id);
			}
		}
		return Optional.empty();
	}

	private void refreshQuietly(UUID userId) {
		if (users.existsById(userId)) {
			refresh(userId);
		}
	}

	private static Instant instant(Long epochMs) {
		return epochMs == null ? null : Instant.ofEpochMilli(epochMs);
	}

	private static List<UUID> ids(List<String> values) {
		List<UUID> ids = new ArrayList<>();
		if (values == null) {
			return ids;
		}
		for (String value : values) {
			try {
				if (value != null) {
					ids.add(UUID.fromString(value));
				}
			}
			catch (IllegalArgumentException ignored) {
			}
		}
		return ids;
	}

	private String entitlement() {
		String id = props.billing().entitlement();
		return id == null || id.isBlank() ? "pro" : id;
	}
}
