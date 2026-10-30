package com.dropzone.api.common;

import com.dropzone.api.domain.AutoSource;
import com.dropzone.api.domain.CheckAudience;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.FeedType;
import com.dropzone.api.domain.LengthUnit;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.ModerationState;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.Period;
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
import com.dropzone.api.storage.Photos;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class Dtos {

	private Dtos() {
	}

	public record UserDto(UUID id, String email, String displayName, String handle, @Photo String avatarUrl, Theme theme, Path path,
			boolean pro, Instant proExpiresAt, UnlockMode unlockMode, int minutesPerQuest, boolean publicByDefault,
			Verification defaultVerification, boolean slipUpTracking, List<String> lockedApps, boolean onboarded, int streak,
			int bestStreak, String inviteCode, String timezone, boolean trial, Instant trialEndsAt, WeightUnit weightUnit,
			LengthUnit lengthUnit, boolean admin, String bio, boolean trialEndPending, boolean consentRequired, boolean suspended,
			boolean willRenew, String proProductId, boolean billingIssue, boolean proEndPending, boolean skipRestDays,
			boolean hiddenFromSearch, boolean hiddenFromLeaderboards, boolean verifyRequestPushes, boolean shareStats, boolean billingHold) {
	}

	public record PublicConfigDto(int minVersionCode, String termsVersion, String privacyVersion, String termsUrl, String privacyUrl,
			String deleteAccountUrl) {
	}

	public record UserSummary(UUID id, String displayName, String handle, @Photo String avatarUrl, Path path, String bio) {
	}

	public record HandleCheck(String handle, boolean valid, boolean available, String message) {
	}

	public record AuthResponse(String token, UserDto user) {
	}

	public record CheckpointDto(UUID id, int index, double targetValue, double deltaToEarn, String rewardTitle,
			@Photo String rewardImageUrl, PhotoCredit rewardImageCredit, @JsonProperty("isPublic") boolean isPublic, Verification verification,
			LocalDate deadline, CheckpointStatus status, Instant clearedAt, UUID proofId, int verifiedCount, int requiredVerifications,
			boolean overdue, PostVisibility visibility, boolean aiChecked, ModerationState moderation) {
	}

	public record GoalDto(UUID id, Path path, Metric metric, String metricLabel, String unit, double startValue, double goalValue,
			double currentValue, double progressValue, double totalValue, List<CheckpointDto> checkpoints, boolean reached) {
	}

	public record PastGoalDto(UUID id, Path path, Metric metric, String metricLabel, String unit, double startValue, double goalValue,
			double endValue, Instant startedAt, Instant endedAt, Instant reachedAt, boolean reached, int milestones, int milestonesCleared) {
	}

	public record OnboardingResponse(UserDto user, GoalDto goal) {
	}

	public record QuestTypeDto(String code, Path path, String name, String icon, QuestGroup group, ProofType proof, boolean free,
			AutoSource autoSource, Integer target, boolean multiSlot, List<Integer> defaultDays, int defaultPerDay) {
	}

	public record UserQuestDto(UUID id, String code, String name, String icon, QuestGroup group, ProofType proof,
			AutoSource autoSource, Integer target, boolean custom, List<Integer> days, boolean squadCheck, int perDay,
			boolean multiSlot, CheckAudience checkAudience) {
	}

	public record TodayQuestDto(UserQuestDto quest, QuestStatus status, Double progress, Integer target, UUID completionId,
			UUID proofId, int verifiedCount, int requiredVerifications, String summary, Double value, int slot, int slots) {
	}

	public record FriendsCleared(int count, int total, @Photos List<String> avatars) {
	}

	public record TodayDto(LocalDate date, List<TodayQuestDto> quests, int doneCount, int totalCount, boolean unlocked,
			Instant unlockedUntil, int minutesEarned, int streak, FriendsCleared friendsCleared) {
	}

	public record HistoryPoint(LocalDate day, double value) {
	}

	public record MeasurementDto(UUID id, Metric metric, LocalDate day, double value, Instant createdAt) {
	}

	public record GoalHistoryDto(LocalDate start, List<HistoryPoint> points) {
	}

	public record WeighInDto(UUID id, LocalDate date, double value) {
	}

	public record UploadResponse(@Photo String url) {
	}

	public record PhotoCredit(String name, String link) {
	}

	public record PhotoDto(String id, String url, String thumb, PhotoCredit credit) {
	}

	public record VerificationInfo(int required, int count, boolean verifiedByMe, boolean canVerify) {
	}

	public record FeedItemDto(UUID id, FeedType type, UserSummary user, Instant createdAt, @Photo String photoUrl, String title,
			String subtitle, Double deltaValue, Double value, String unit, UUID proofId, VerificationInfo verification, int hypeCount,
			boolean hypedByMe, int commentCount, TransformationView transformation, boolean hidden, boolean aiChecked,
			@JsonProperty("isPublic") boolean isPublic, ModerationState moderation) {
	}

	public record TransformationView(TransformationLayout layout, @Photo String beforeUrl, @Photo String afterUrl, String beforeCaption,
			String afterCaption) {
	}

	public record TransformationDto(UUID id, @Photo String beforeUrl, @Photo String afterUrl, String beforeCaption, String afterCaption,
			TransformationLayout layout, PostVisibility visibility, Instant createdAt, Instant updatedAt, UUID feedItemId, int commentCount,
			int hypeCount, boolean removedByModerator, ModerationState moderation) {
	}

	public record CommentDto(UUID id, UUID feedItemId, UserSummary user, String body, Instant createdAt, boolean mine, int likeCount,
			boolean likedByMe, boolean canDelete) {
	}

	public record NotificationDto(UUID id, NotificationType type, UserSummary actor, UUID feedItemId, UUID proofId, UUID commentId,
			String text, boolean read, Instant createdAt) {
	}

	public record ReportedItemDto(ReportTarget targetType, UUID targetId, int reportCount, boolean hidden, List<String> reasons,
			Instant lastReportedAt, UserSummary author, String preview, @Photo String photoUrl, UUID feedItemId) {
	}

	public record ReportEntryDto(ReportTarget targetType, UUID targetId, UserSummary reporter, String reason, Instant createdAt) {
	}

	public record AdminUserDto(UserSummary user, String email, Instant createdAt, boolean suspended, Instant suspendedAt, int strikes,
			List<ReportEntryDto> reports) {
	}

	public record AdminPostDto(UUID id, FeedType type, UserSummary user, Instant createdAt, String title, String subtitle, @Photo String photoUrl,
			@Photos List<String> photos, TransformationView transformation, boolean hidden, @JsonProperty("isPublic") boolean isPublic, UUID proofId,
			ProofStatus proofStatus, List<String> mlLabels, String mlText) {
	}

	public record AdminCommentDto(UUID id, UserSummary user, String body, Instant createdAt, boolean hidden) {
	}

	public record AdminReportDto(ReportTarget targetType, UUID targetId, int reportCount, boolean hidden, List<ReportEntryDto> reports,
			AdminPostDto post, AdminCommentDto comment, AdminUserDto user) {
	}

	public record CountDto(long count) {
	}

	public record DailyLogDto(UUID id, LocalDate day, UserQuestDto quest, QuestStatus status, int slot, int slots, Double value,
			Integer reps, String summary, Instant createdAt, @Photo String photoUrl, UUID proofId, int verifiedCount, int requiredVerifications,
			UUID feedItemId) {
	}

	public record DailyLogDetailDto(DailyLogDto log, List<String> mlLabels, String mlText, ProofStatus proofStatus,
			List<UserSummary> verifiers) {
	}

	public record DayLogsDto(LocalDate date, int doneCount, int totalCount, List<DailyLogDto> logs) {
	}

	public record FriendRequestDto(UUID id, UserSummary from, UserSummary to, Instant createdAt) {
	}

	public record RequestsDto(List<FriendRequestDto> incoming, List<FriendRequestDto> outgoing) {
	}

	public record InviteResultDto(UserSummary user, Relation relation) {
	}

	public record InviteDto(String code, String url) {
	}

	public record LeaderboardEntryDto(int rank, UserSummary user, double delta, String unit, Double percent) {
	}

	public record LeaderboardDto(Period period, Path path, Metric metric, String unit, Instant endsAt,
			List<LeaderboardEntryDto> entries, LeaderboardEntryDto me) {
	}

	public record StatsDayDto(LocalDate date, int questLevel, int slipUps, boolean future) {
	}

	public record TopSlipUp(String type, String name, long count) {
	}

	public record StatsDto(String month, List<StatsDayDto> days, int clearedPct, int bestStreak, int questsDone, long slipUpCount,
			Integer slipUpChangePct, int cleanDays, List<TopSlipUp> topSlipUps) {
	}

	public record SlipUpTypeDto(String code, String name, String icon, boolean custom) {
	}

	public record SlipUpDto(UUID id, String type, String name, String icon, Instant occurredAt, String note) {
	}

	public enum Relation {
		SELF, FRIEND, REQUESTED, INCOMING, NONE
	}

	public enum HiddenReason {
		FRIENDS_ONLY, UNDER_REVIEW, REMOVED
	}

	public record ProofViewDto(UUID id, ProofKind kind, ProofStatus status, UserSummary owner, Relation relation, boolean visible,
			FeedItemDto post, HiddenReason reason, ModerationState moderation, Instant useAiFrom) {
	}

	public record PeopleDto(int count, List<UserSummary> users) {
	}

	public record CheckpointSocialDto(PeopleDto hypes, PeopleDto alsoChasing) {
	}
}
