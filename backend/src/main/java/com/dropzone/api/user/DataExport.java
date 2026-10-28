package com.dropzone.api.user;

import com.dropzone.api.common.Dtos.MeasurementDto;
import com.dropzone.api.common.Dtos.PhotoCredit;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.domain.AutoSource;
import com.dropzone.api.domain.CheckAudience;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.LengthUnit;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.Platform;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.ProofKind;
import com.dropzone.api.domain.ProofStatus;
import com.dropzone.api.domain.ProofType;
import com.dropzone.api.domain.QuestGroup;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.Theme;
import com.dropzone.api.domain.TransformationLayout;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.Verification;
import com.dropzone.api.domain.WeightUnit;
import com.dropzone.api.storage.Photo;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record DataExport(Instant exportedAt, Profile profile, List<GoalEntry> goals, List<QuestEntry> quests,
		List<CompletionEntry> completions, List<DayEntry> days, List<WeighInEntry> weighIns, List<MeasurementDto> measurements,
		List<SlipUpEntry> slipUps, List<SlipUpTypeEntry> customSlipUpTypes, List<PostEntry> posts, List<CommentEntry> comments,
		List<TransformationEntry> transformations, Friends friends, List<NotificationEntry> notifications, List<HypeEntry> hypes,
		List<CommentLikeEntry> commentLikes, List<ReportEntry> reports, List<DeviceEntry> devices) {

	public record Profile(UUID id, String email, String displayName, String handle, String bio, @Photo String avatarUrl, Theme theme, Path path,
			String timezone, WeightUnit weightUnit, LengthUnit lengthUnit, UnlockMode unlockMode, int minutesPerQuest,
			boolean publicByDefault, Verification defaultVerification, boolean slipUpTracking, boolean skipRestDays, List<String> lockedApps,
			int streak, int bestStreak, String inviteCode, Instant createdAt, Instant lastSeenAt, boolean pro, Instant proExpiresAt,
			String proProductId, Instant trialEndsAt, String termsVersion, String privacyVersion, Instant termsAcceptedAt,
			Instant ageConfirmedAt, boolean hiddenFromSearch, boolean hiddenFromLeaderboards, boolean verifyRequestPushes, boolean shareStats,
			Instant shareStatsAt, String regionSource, String regionValue, Boolean regionEu, Instant regionAt) {
	}

	public record ProofEntry(UUID id, ProofKind kind, @Photo String photoUrl, Double value, List<String> mlLabels, String mlText, ProofStatus status,
			int requiredVerifications, int verifiedCount, @JsonProperty("isPublic") boolean isPublic, boolean aiChecked, Instant createdAt) {
	}

	public record GoalEntry(UUID id, Path path, Metric metric, String metricLabel, String unit, double startValue, double goalValue,
			double currentValue, boolean active, Instant createdAt, Instant endedAt, List<MilestoneEntry> milestones) {
	}

	public record MilestoneEntry(UUID id, int index, double targetValue, String rewardTitle, @Photo String rewardImageUrl,
			PhotoCredit rewardImageCredit, PostVisibility visibility, Verification verification, LocalDate deadline,
			CheckpointStatus status, Instant clearedAt, ProofEntry proof) {
	}

	public record QuestEntry(UUID id, String code, String name, String icon, QuestGroup group, ProofType proof, AutoSource autoSource,
			Integer target, boolean custom, List<Integer> days, int perDay, boolean squadCheck, CheckAudience checkAudience, boolean active,
			Instant createdAt) {
	}

	public record CompletionEntry(UUID id, UUID questId, LocalDate day, int slot, QuestStatus status, Double value, Integer reps,
			String summary, Instant createdAt, ProofEntry proof) {
	}

	public record DayEntry(LocalDate day, int doneCount, int totalCount) {
	}

	public record WeighInEntry(LocalDate day, double value, @Photo String photoUrl, String mlText, Instant createdAt) {
	}

	public record SlipUpEntry(UUID id, String type, String name, Instant occurredAt, String note, Instant createdAt) {
	}

	public record SlipUpTypeEntry(String code, String name, String icon, boolean active) {
	}

	public record PostEntry(UUID id, FeedType type, String title, String subtitle, @Photo String photoUrl, Double deltaValue, Double value,
			String unit, @JsonProperty("isPublic") boolean isPublic, boolean hidden, Instant createdAt, UUID proofId, UUID checkpointId,
			UUID transformationId) {
	}

	public record CommentEntry(UUID id, UUID feedItemId, String body, boolean hidden, Instant createdAt) {
	}

	public record TransformationEntry(UUID id, @Photo String beforeUrl, @Photo String afterUrl, String beforeCaption, String afterCaption,
			TransformationLayout layout, PostVisibility visibility, boolean removedByModerator, Instant createdAt, Instant updatedAt) {
	}

	public record Person(UserSummary user, Instant since) {
	}

	public record Friends(List<Person> friends, List<Person> incomingRequests, List<Person> outgoingRequests, List<Person> blocked) {
	}

	public record NotificationEntry(UUID id, NotificationType type, UserSummary actor, UUID feedItemId, UUID proofId, UUID commentId,
			String text, boolean read, Instant createdAt) {
	}

	public record HypeEntry(UUID feedItemId, Instant createdAt) {
	}

	public record CommentLikeEntry(UUID commentId, Instant createdAt) {
	}

	public record ReportEntry(ReportTarget targetType, UUID targetId, String reason, Instant createdAt) {
	}

	public record DeviceEntry(Platform platform, Instant updatedAt) {
	}
}
