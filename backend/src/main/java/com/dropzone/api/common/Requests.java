package com.dropzone.api.common;

import com.dropzone.api.domain.CheckAudience;
import com.dropzone.api.domain.Exercise;
import com.dropzone.api.domain.LengthUnit;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import com.dropzone.api.domain.Platform;
import com.dropzone.api.domain.PostVisibility;
import com.dropzone.api.domain.ProofType;
import com.dropzone.api.domain.QuestGroup;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.Theme;
import com.dropzone.api.domain.TransformationLayout;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.Verification;
import com.dropzone.api.domain.WeightUnit;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class Requests {

	public static final int MAX_URL = 1024;
	public static final int MAX_ML_TEXT = 2000;
	public static final int MAX_ML_LABELS = 30;
	public static final int MAX_ML_LABEL = 60;
	public static final int MAX_CODES = 50;
	public static final int MAX_TARGET = 100_000;
	public static final int MAX_REPS = 500;

	private Requests() {
	}

	public record GoogleAuth(@NotBlank @Size(max = 4096) String idToken) {
	}

	public record DevAuth(@NotBlank @Email @Size(max = 320) String email, @NotBlank @Size(max = 80) String displayName) {
	}

	public record UpdateMe(@Size(min = 1, max = 80) String displayName, @Size(max = 64) String handle, Theme theme, UnlockMode unlockMode,
			@Min(5) @Max(240) Integer minutesPerQuest, Boolean publicByDefault, Verification defaultVerification,
			Boolean slipUpTracking, @Size(max = 64) String timezone, WeightUnit weightUnit, LengthUnit lengthUnit,
			@Size(max = 150) String bio, @Size(max = MAX_URL) String avatarUrl, Boolean trialEndAcknowledged, Boolean proEndAcknowledged,
			Boolean skipRestDays, Boolean hiddenFromSearch, Boolean hiddenFromLeaderboards, Boolean verifyRequestPushes,
			Boolean shareStats, @Valid Region region) {
	}

	public record UpdateGoal(@Positive Double startValue, @Positive Double goalValue) {
	}

	public record PushToken(@NotBlank @Size(max = 512) String token, Platform platform) {
	}

	public record RemovePushToken(@NotBlank @Size(max = 512) String token) {
	}

	public record LockedApps(@NotNull @Size(max = 20) List<@NotBlank @Size(max = 255) String> packages) {
	}

	public record Consent(@NotBlank @Size(max = 32) String termsVersion, @NotBlank @Size(max = 32) String privacyVersion,
			Boolean ageConfirmed, Boolean shareStats, @Valid Region region) {
	}

	public record Region(@NotBlank @Size(max = 16) String source, @Size(max = 64) String value, @NotNull Boolean eu) {
	}

	public record Onboarding(@NotNull Path path, @NotNull Metric metric, @Size(max = 60) String metricLabel,
			@NotBlank @Size(max = 4) String unit, @NotNull @Positive Double startValue, @NotNull @Positive Double goalValue,
			@NotNull @Min(2) @Max(10) Integer checkpoints, @NotNull @Size(max = MAX_CODES) List<@Size(max = 32) String> questCodes,
			@Size(max = 20) List<@Size(max = 255) String> lockedApps, UnlockMode unlockMode,
			@Valid @Size(max = MAX_CODES) List<QuestSettings> questSettings, WeightUnit weightUnit, LengthUnit lengthUnit) {
	}

	public record CheckpointProof(@NotBlank @Size(max = MAX_URL) String photoUrl, @NotNull @Positive Double value,
			@Size(max = MAX_ML_LABELS) List<@Size(max = MAX_ML_LABEL) String> mlLabels, @Size(max = MAX_ML_TEXT) String mlText) {
	}

	public record SetQuests(@NotNull @Size(max = MAX_CODES) List<@Size(max = 32) String> codes,
			@Valid @Size(max = MAX_CODES) List<QuestSettings> settings) {
	}

	public record QuestSettings(@NotBlank @Size(max = 32) String code, @Size(min = 1, max = 7) List<@NotNull @Min(1) @Max(7) Integer> days,
			@Min(1) @Max(20) Integer perDay, @Min(1) @Max(MAX_TARGET) Integer target) {
	}

	public record CustomQuest(@NotBlank @Size(max = 40) String name, @NotBlank @Size(max = 32) String icon, @NotNull ProofType proof,
			@NotNull QuestGroup group, @NotEmpty @Size(max = 7) List<@NotNull @Min(1) @Max(7) Integer> days, boolean squadCheck,
			CheckAudience checkAudience) {
	}

	public record CompleteQuest(LocalDate date, @Size(max = MAX_URL) String photoUrl, @PositiveOrZero @DecimalMax("100000") Double value,
			@Min(0) @Max(MAX_REPS) Integer reps, @Size(max = MAX_ML_LABELS) List<@Size(max = MAX_ML_LABEL) String> mlLabels,
			@Size(max = MAX_ML_TEXT) String mlText, @Min(1) @Max(20) Integer slot, Exercise exercise) {
	}

	public record WeighIn(LocalDate date, @NotNull @DecimalMin("20") @DecimalMax("350") Double value, @Size(max = MAX_URL) String photoUrl,
			@Size(max = MAX_ML_TEXT) String mlText) {
	}

	public record CreateFriendRequest(@NotNull UUID userId) {
	}

	public record CreateSlipUp(@NotBlank @Size(max = 32) String type, Instant occurredAt, @Size(max = 280) String note) {
	}

	public record CreateTransformation(@NotBlank @Size(max = MAX_URL) String beforeUrl, @NotBlank @Size(max = MAX_URL) String afterUrl,
			@Size(max = 160) String beforeCaption, @Size(max = 160) String afterCaption, TransformationLayout layout,
			PostVisibility visibility) {
	}

	public record UpdateTransformation(@Size(min = 1, max = MAX_URL) String beforeUrl, @Size(min = 1, max = MAX_URL) String afterUrl,
			@Size(max = 160) String beforeCaption, @Size(max = 160) String afterCaption, TransformationLayout layout,
			PostVisibility visibility) {
	}

	public record CreateComment(@NotBlank @Size(max = 500) String body) {
	}

	public record CreateReport(@NotNull ReportTarget targetType, @NotNull UUID targetId, @Size(max = 280) String reason) {
	}

	public record UpdatePost(@NotNull @JsonProperty("isPublic") Boolean isPublic) {
	}

	public record CreateSlipUpType(@NotBlank @Size(max = 40) String name, @NotBlank @Size(max = 32) String icon) {
	}

	public record UpdateQuest(Boolean squadCheck, @Size(min = 1, max = 7) List<@NotNull @Min(1) @Max(7) Integer> days,
			@Min(1) @Max(20) Integer perDay, @Min(1) @Max(MAX_TARGET) Integer target, CheckAudience checkAudience) {
	}

	public record GoalProgress(@NotNull @Positive Double value, LocalDate date) {
	}

	public record NewGoal(Metric metric, @Size(max = 60) String metricLabel, @Size(max = 4) String unit, @Positive Double startValue,
			@NotNull @Positive Double goalValue, @NotNull @Min(2) @Max(10) Integer checkpoints) {
	}

	public record Search(String q) {
	}

	public record HandleQuery(@NotNull @Size(max = 64) String handle) {
	}
}
