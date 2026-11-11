package com.dropzone.api.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "users")
@DynamicUpdate
public class User {

	public static final Duration RENEWAL_LEEWAY = Duration.ofHours(6);

	public static final Duration PENDING_SWITCH_GRACE = Duration.ofDays(1);

	@Id
	public UUID id;

	@Column(nullable = false, unique = true)
	public String email;

	public String googleSub;

	public String appleSub;

	public String appleRefreshToken;

	@Column(nullable = false)
	public String displayName;

	@Column(nullable = false, unique = true)
	public String handle;

	public String bio;

	public String avatarUrl;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Theme theme = Theme.NEON;

	@Enumerated(EnumType.STRING)
	public Path path;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public WeightUnit weightUnit = WeightUnit.KG;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public LengthUnit lengthUnit = LengthUnit.CM;

	public boolean pro;

	public Instant proExpiresAt;

	public boolean willRenew;

	public String proProductId;

	public String proStore;

	public Instant billingIssueAt;

	public boolean billingHold;

	public String pendingProductId;

	public Instant pendingSwitchAt;

	public Instant lifetimeAt;

	public Instant billingEventAt;

	public Instant proEndedAt;

	public Instant proEndAckAt;

	public Instant proRefreshedAt;

	public Instant trialEndsAt;

	public Instant trialRemindedAt;

	public Instant trialEndedNotifiedAt;

	public Instant trialEndAckAt;

	public LocalDate dailyRemindedOn;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public UnlockMode unlockMode = UnlockMode.WHOLE_DAY;

	public int minutesPerQuest = 30;

	public boolean publicByDefault;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Verification defaultVerification = Verification.AI;

	public boolean slipUpTracking = true;

	public boolean onboarded;

	@Column(updatable = false)
	public int streak;

	@Column(updatable = false)
	public int bestStreak;

	@Column(nullable = false, unique = true)
	public String inviteCode;

	@Column(nullable = false)
	public String timezone = "UTC";

	public int tokenVersion;

	public String termsVersion;

	public String privacyVersion;

	public Instant termsAcceptedAt;

	public Instant ageConfirmedAt;

	public boolean skipRestDays;

	public boolean hiddenFromSearch;

	public boolean hiddenFromLeaderboards;

	public boolean verifyRequestPushes = true;

	public boolean commentPushes = true;

	public boolean reminderPushes = true;

	public boolean deadlinePushes = true;

	public boolean hypePushes = true;

	public boolean friendPushes = true;

	public boolean proofResultPushes = true;

	public boolean shareStats;

	public Instant shareStatsAt;

	public String regionSource;

	public String regionValue;

	public Boolean regionEu;

	public Instant regionAt;

	public Instant suspendedAt;

	@Column(updatable = false)
	public int moderationStrikes;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	@Column(updatable = false)
	public Instant lastSeenAt;

	@ElementCollection
	@CollectionTable(name = "user_locked_apps", joinColumns = @JoinColumn(name = "user_id"))
	@Column(name = "package_name")
	public Set<String> lockedApps = new LinkedHashSet<>();

	public boolean isSuspended() {
		return suspendedAt != null;
	}

	public boolean isProActive(Instant now) {
		return isSubscribed(now) || isTrialActive(now);
	}

	public boolean isSubscribed(Instant now) {
		return pro && active(proExpiresAt, willRenew, now);
	}

	public static boolean active(Instant expiresAt, boolean willRenew, Instant now) {
		return expiresAt == null || (willRenew ? expiresAt.plus(RENEWAL_LEEWAY) : expiresAt).isAfter(now);
	}

	public String pendingPlan(Instant now) {
		if (pendingProductId == null || pendingSwitchAt == null || !isSubscribed(now)) {
			return null;
		}
		if (now.isAfter(pendingSwitchAt.plus(PENDING_SWITCH_GRACE))) {
			return null;
		}
		if (proProductId != null && (proProductId.equals(pendingProductId) || proProductId.startsWith(pendingProductId + ":"))) {
			return null;
		}
		return pendingProductId;
	}

	public boolean hasSubscribed() {
		return pro || proEndedAt != null;
	}

	public Instant subscriptionEndedAt(Instant now) {
		if (isSubscribed(now)) {
			return null;
		}
		if (proEndedAt != null) {
			return proEndedAt;
		}
		return pro ? proExpiresAt : null;
	}

	public boolean isProEndPending(Instant now) {
		return proEndAckAt == null && !isTrialActive(now) && subscriptionEndedAt(now) != null;
	}

	public boolean isTrialEndPending(Instant now) {
		return trialEndsAt != null && !trialEndsAt.isAfter(now) && trialEndAckAt == null && !hasSubscribed();
	}

	public boolean isTrialActive(Instant now) {
		return trialEndsAt != null && trialEndsAt.isAfter(now) && !hasSubscribed();
	}
}
