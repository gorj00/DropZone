package com.dropzone.api.admin;

import com.dropzone.api.common.Dtos.ReportEntryDto;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.LengthUnit;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.ProofStatus;
import com.dropzone.api.domain.ProofType;
import com.dropzone.api.domain.QuestGroup;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.Verification;
import com.dropzone.api.domain.WeightUnit;
import com.dropzone.api.storage.Photo;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class AdminDtos {

	private AdminDtos() {
	}

	public record Totals(long users, long onboarded, long subscribed, long trial, long suspended, long newLast7Days, long activeLast7Days) {
	}

	public record SignupDay(LocalDate day, long count) {
	}

	public record JobView(String name, Instant lastRunAt, Instant failedAt, String error) {
	}

	public record Health(int errorsLast5Minutes, int busyLast5Minutes, int databaseWaitsLast5Minutes, int inFlight, int poolActive,
			int poolIdle, int poolWaiting, int poolMax, long heapUsedMb, long heapMaxMb, Instant startedAt, String version, String commit,
			String revision) {
	}

	public record Overview(Totals totals, List<SignupDay> signups, List<JobView> jobs, long failedJobs, Health health, long openReports,
			long errorsLast24Hours, List<BillingEventView> billingEvents) {
	}

	public record UserRow(UUID id, String email, String displayName, String handle, @Photo String avatarUrl, Path path, boolean onboarded,
			boolean subscribed, boolean trial, Instant trialEndsAt, Instant proExpiresAt, String proProductId, boolean suspended, int strikes,
			int streak, Instant createdAt, Instant lastSeenAt, String timezone, boolean admin) {
	}

	public record UserPage(List<UserRow> items, long total) {
	}

	public record Billing(boolean pro, Instant proExpiresAt, boolean willRenew, String proProductId, Instant billingIssueAt,
			boolean billingHold, String pendingProductId, Instant pendingSwitchAt, Instant lifetimeAt, Instant billingEventAt,
			Instant proEndedAt, Instant trialEndsAt) {
	}

	public record Consent(String termsVersion, String privacyVersion, Instant termsAcceptedAt, Instant ageConfirmedAt, String regionSource,
			String regionValue, Boolean regionEu, Instant regionAt) {
	}

	public record CheckpointView(UUID id, int index, double targetValue, String rewardTitle, CheckpointStatus status, Instant clearedAt,
			LocalDate deadline, Verification verification, PostVisibility visibility) {
	}

	public record GoalView(UUID id, Path path, Metric metric, String metricLabel, String unit, double startValue, double goalValue,
			double currentValue, boolean active, Instant createdAt, Instant endedAt, List<CheckpointView> checkpoints) {
	}

	public record QuestView(UUID id, String code, String name, String icon, QuestGroup group, ProofType proof, Integer target,
			List<Integer> days, int perDay, boolean custom, boolean active, LocalDate startsOn, Instant createdAt) {
	}

	public record Counts(long posts, long comments, long friends, long days, long devices) {
	}

	public record Account(UserRow user, String bio, WeightUnit weightUnit, LengthUnit lengthUnit, UnlockMode unlockMode,
			boolean publicByDefault, Verification defaultVerification, int bestStreak, boolean skipRestDays, boolean hiddenFromSearch,
			boolean hiddenFromLeaderboards, Billing billing, Consent consent, Counts counts, List<GoalView> goals, List<QuestView> quests,
			List<ReportEntryDto> reports) {
	}

	public record CompletionView(UUID id, String questName, String questIcon, QuestStatus status, int slot, Double value, Integer reps,
			String summary, Instant createdAt, @Photo String photoUrl, ProofStatus proofStatus) {
	}

	public record SlipUpView(String type, Instant occurredAt, String note) {
	}

	public record DayView(LocalDate day, Integer doneCount, Integer totalCount, Instant proClearedAt, Double weight,
			@Photo String weighInPhotoUrl, List<CompletionView> completions, List<SlipUpView> slipUps) {
	}

	public record ErrorView(UUID id, Instant at, String method, String path, String exception, String message, UUID userId, String email,
			String revision) {
	}

	public record BillingEventView(String id, String type, String appUserId, String email, String environment, Instant receivedAt) {
	}
}
