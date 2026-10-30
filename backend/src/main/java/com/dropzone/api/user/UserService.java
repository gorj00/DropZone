package com.dropzone.api.user;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.HandleCheck;
import com.dropzone.api.common.Dtos.UserDto;
import com.dropzone.api.common.Dtos.UserSummary;
import com.dropzone.api.common.Requests;
import com.dropzone.api.config.AppProperties;
import com.dropzone.api.storage.PhotoUrls;
import com.dropzone.api.storage.UploadCleanup;
import com.dropzone.api.domain.UnlockMode;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.domain.Verification;
import com.dropzone.api.progress.ProgressService;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

	public static final String INSTAGRAM = "com.instagram.android";

	public static final int TRIAL_DAYS = 7;
	static final Duration LAST_SEEN_EVERY = Duration.ofDays(1);
	public static final int MIN_AGE = 18;
	private static final Pattern HANDLE = Pattern.compile("^[a-z0-9._]{3,20}$");
	private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	public static final int MAX_NAME = 80;
	static final Set<String> RESERVED_HANDLES = Set.of("dropzone", "admin", "administrator", "support", "official", "moderator", "mod",
			"help", "staff", "team", "system", "root");
	static final String RESERVED_NAME_PREFIX = "dropzone";

	private final UserRepository users;
	private final ProgressService progress;
	private final AppProperties props;
	private final PhotoUrls photoUrls;
	private final UploadCleanup uploads;
	private final Clock clock;
	private final SecureRandom random = new SecureRandom();

	public UserService(UserRepository users, ProgressService progress, AppProperties props, PhotoUrls photoUrls, UploadCleanup uploads,
			Clock clock) {
		this.users = users;
		this.progress = progress;
		this.props = props;
		this.photoUrls = photoUrls;
		this.uploads = uploads;
		this.clock = clock;
	}

	@Transactional
	public UserDto me(UUID id) {
		User user = get(id);
		Instant now = clock.instant();
		users.touchLastSeen(id, now, now.minus(LAST_SEEN_EVERY));
		progress.refreshStreak(user, today(user));
		return toDto(user);
	}

	public void startTrial(User user) {
		if (user.trialEndsAt == null) {
			user.trialEndsAt = clock.instant().plus(TRIAL_DAYS, ChronoUnit.DAYS);
		}
	}

	@Transactional(readOnly = true)
	public User get(UUID id) {
		return users.findById(id).orElseThrow(() -> ApiException.unauthorized("Unknown user"));
	}

	@Transactional
	public User lock(UUID id) {
		return users.findForUpdate(id).orElseThrow(() -> ApiException.unauthorized("Unknown user"));
	}

	public boolean isAdmin(User user) {
		List<String> admins = props.adminEmails();
		return admins != null && user.email != null && user.googleSub != null
				&& admins.stream().map(String::trim).anyMatch(e -> !e.isEmpty() && e.equalsIgnoreCase(user.email));
	}

	public void requireAdmin(User user) {
		if (!isAdmin(user)) {
			throw ApiException.forbidden("Admins only");
		}
	}

	@Transactional(readOnly = true)
	public List<User> admins() {
		List<String> emails = props.adminEmails() == null ? List.of()
				: props.adminEmails().stream().map(UserService::normalizeEmail).filter(e -> !e.isEmpty()).toList();
		return emails.isEmpty() ? List.of() : users.findByEmailIn(emails).stream().filter(this::isAdmin).toList();
	}

	@Transactional(readOnly = true)
	public String generatedHandle() {
		String candidate;
		do {
			candidate = "user" + (10_000_000 + random.nextInt(90_000_000));
		}
		while (users.existsByHandle(candidate));
		return candidate;
	}

	public boolean isPro(User user) {
		return user.isProActive(clock.instant());
	}

	public void requirePro(User user, String feature) {
		if (!isPro(user)) {
			throw ApiException.proRequired(feature + " is a PRO feature");
		}
	}

	public LocalDate today(User user) {
		return LocalDate.now(clock.withZone(zone(user)));
	}

	public ZoneId zone(User user) {
		return zone(user.timezone);
	}

	public static ZoneId zone(String timezone) {
		try {
			return ZoneId.of(timezone);
		}
		catch (Exception e) {
			return ZoneId.of("UTC");
		}
	}

	public UserDto toDto(User user) {
		Instant now = clock.instant();
		boolean pro = user.isProActive(now);
		return new UserDto(user.id, user.email, user.displayName, user.handle, user.avatarUrl, user.theme, user.path, pro,
				user.proExpiresAt, effectiveUnlockMode(user), user.minutesPerQuest, user.publicByDefault, user.defaultVerification,
				user.slipUpTracking, effectiveLockedApps(user), user.onboarded, user.streak, user.bestStreak, user.inviteCode,
				user.timezone, user.isTrialActive(now) && !user.isSubscribed(now), user.trialEndsAt, user.weightUnit, user.lengthUnit,
				isAdmin(user), user.bio, user.isTrialEndPending(now), consentRequired(user), user.isSuspended(),
				user.willRenew && user.isSubscribed(now), user.proProductId, user.billingIssueAt != null, user.isProEndPending(now),
				user.skipRestDays, user.hiddenFromSearch, user.hiddenFromLeaderboards, user.verifyRequestPushes, user.shareStats,
				user.billingHold && !user.isSubscribed(now));
	}

	private static void setShareStats(User user, boolean share, Instant now) {
		if (user.shareStats != share || user.shareStatsAt == null) {
			user.shareStats = share;
			user.shareStatsAt = now;
		}
	}

	private static void setRegion(User user, Requests.Region region, Instant now) {
		user.regionSource = region.source().trim();
		user.regionValue = region.value() == null ? null : region.value().trim();
		user.regionEu = region.eu();
		user.regionAt = now;
	}

	public boolean consentRequired(User user) {
		AppProperties.Legal legal = props.legal();
		return user.ageConfirmedAt == null || !Objects.equals(user.termsVersion, legal.termsVersion())
				|| !Objects.equals(user.privacyVersion, legal.privacyVersion());
	}

	@Transactional
	public UserDto consent(UUID userId, Requests.Consent req) {
		User user = get(userId);
		if (!Boolean.TRUE.equals(req.ageConfirmed())) {
			throw ApiException.validation("Confirm that you're " + MIN_AGE + " or older");
		}
		AppProperties.Legal legal = props.legal();
		if (!req.termsVersion().trim().equals(legal.termsVersion()) || !req.privacyVersion().trim().equals(legal.privacyVersion())) {
			throw ApiException.conflict("The terms or privacy policy changed. Load them again and accept the new version.");
		}
		Instant now = clock.instant();
		user.termsVersion = legal.termsVersion();
		user.privacyVersion = legal.privacyVersion();
		user.termsAcceptedAt = now;
		user.ageConfirmedAt = now;
		if (req.shareStats() != null) {
			setShareStats(user, req.shareStats(), now);
		}
		if (req.region() != null) {
			setRegion(user, req.region(), now);
		}
		return toDto(user);
	}

	@Transactional
	public void signOutEverywhere(UUID userId) {
		get(userId);
		users.bumpTokenVersion(userId);
	}

	public UnlockMode effectiveUnlockMode(User user) {
		return user.unlockMode == UnlockMode.MINUTES && isPro(user) ? UnlockMode.MINUTES : UnlockMode.WHOLE_DAY;
	}

	public List<String> effectiveLockedApps(User user) {
		boolean pro = isPro(user);
		return user.lockedApps.stream().filter(p -> pro || p.equals(INSTAGRAM)).toList();
	}

	public static UserSummary summary(User user) {
		return new UserSummary(user.id, user.displayName, user.handle, user.avatarUrl, user.path, user.bio);
	}

	@Transactional
	public User create(String email, String displayName, String googleSub, String avatarUrl) {
		User user = new User();
		user.id = UUID.randomUUID();
		user.email = normalizeEmail(email);
		user.displayName = initialName(displayName, user.email);
		user.googleSub = googleSub;
		user.avatarUrl = avatarUrl;
		user.handle = uniqueHandle(user.displayName, email);
		user.inviteCode = uniqueInviteCode();
		user.createdAt = clock.instant();
		user.lastSeenAt = user.createdAt;
		return users.save(user);
	}

	@Transactional
	public UserDto update(UUID userId, Requests.UpdateMe req) {
		User user = get(userId);
		if (req.displayName() != null) {
			String name = req.displayName().trim();
			if (name.isEmpty()) {
				throw ApiException.validation("Name can't be empty");
			}
			if (reservedName(name) && !name.equals(user.displayName)) {
				throw ApiException.validation("Names starting with DropZone are reserved");
			}
			user.displayName = name;
		}
		if (req.handle() != null) {
			HandleCheck check = checkHandle(user.id, req.handle());
			if (!check.valid()) {
				throw ApiException.validation(check.message());
			}
			if (!check.available()) {
				throw ApiException.conflict(check.message());
			}
			user.handle = check.handle();
		}
		if (req.bio() != null) {
			String bio = req.bio().trim();
			user.bio = bio.isEmpty() ? null : bio;
		}
		if (req.avatarUrl() != null) {
			String url = photoUrls.canonical(req.avatarUrl());
			String previous = user.avatarUrl;
			if (!url.isEmpty() && !url.equals(previous)) {
				photoUrls.ownUpload(user.id, url, "avatarUrl");
			}
			user.avatarUrl = url.isEmpty() ? null : url;
			if (previous != null && !previous.equals(user.avatarUrl)) {
				uploads.deleteIfUnused(previous);
			}
		}
		if (req.theme() != null) {
			user.theme = req.theme();
		}
		if (req.unlockMode() != null) {
			if (req.unlockMode() == UnlockMode.MINUTES) {
				requirePro(user, "Minutes unlock");
			}
			user.unlockMode = req.unlockMode();
		}
		if (req.minutesPerQuest() != null) {
			user.minutesPerQuest = req.minutesPerQuest();
		}
		if (req.publicByDefault() != null) {
			if (req.publicByDefault()) {
				requirePro(user, "Public milestone rewards");
			}
			user.publicByDefault = req.publicByDefault();
		}
		if (req.defaultVerification() != null) {
			if (req.defaultVerification() == Verification.COMMUNITY) {
				requirePro(user, "Community verification");
			}
			user.defaultVerification = req.defaultVerification();
		}
		if (req.slipUpTracking() != null) {
			user.slipUpTracking = req.slipUpTracking();
		}
		if (req.skipRestDays() != null && req.skipRestDays() != user.skipRestDays) {
			user.skipRestDays = req.skipRestDays();
			progress.refreshStreak(user, today(user));
		}
		if (req.hiddenFromSearch() != null) {
			user.hiddenFromSearch = req.hiddenFromSearch();
		}
		if (req.hiddenFromLeaderboards() != null) {
			user.hiddenFromLeaderboards = req.hiddenFromLeaderboards();
		}
		if (req.verifyRequestPushes() != null) {
			user.verifyRequestPushes = req.verifyRequestPushes();
		}
		if (req.shareStats() != null) {
			setShareStats(user, req.shareStats(), clock.instant());
		}
		if (req.region() != null) {
			setRegion(user, req.region(), clock.instant());
		}
		if (req.weightUnit() != null) {
			user.weightUnit = req.weightUnit();
		}
		if (req.lengthUnit() != null) {
			user.lengthUnit = req.lengthUnit();
		}
		if (Boolean.TRUE.equals(req.trialEndAcknowledged()) && user.trialEndAckAt == null) {
			user.trialEndAckAt = clock.instant();
		}
		if (Boolean.TRUE.equals(req.proEndAcknowledged()) && user.isProEndPending(clock.instant())) {
			user.proEndAckAt = clock.instant();
		}
		if (req.timezone() != null) {
			try {
				user.timezone = ZoneId.of(req.timezone()).getId();
			}
			catch (Exception e) {
				throw ApiException.validation("Unknown timezone");
			}
		}
		return toDto(user);
	}

	@Transactional(readOnly = true)
	public HandleCheck checkHandle(UUID userId, String raw) {
		String handle = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replaceFirst("^@", "");
		if (!HANDLE.matcher(handle).matches()) {
			return new HandleCheck(handle, false, false, "Handle must be 3-20 characters: a-z, 0-9, dot or underscore");
		}
		if (RESERVED_HANDLES.contains(handle)) {
			return new HandleCheck(handle, false, false, "This handle is reserved");
		}
		if (users.existsByHandleAndIdNot(handle, userId)) {
			return new HandleCheck(handle, true, false, "Handle is taken");
		}
		return new HandleCheck(handle, true, true, null);
	}

	@Transactional
	public UserDto setLockedApps(UUID userId, List<String> packages) {
		User user = get(userId);
		applyLockedApps(user, packages);
		return toDto(user);
	}

	public void applyLockedApps(User user, List<String> packages) {
		List<String> clean = packages == null ? List.of()
				: packages.stream().map(String::trim).filter(p -> !p.isEmpty()).distinct().toList();
		if (!isPro(user) && clean.stream().anyMatch(p -> !p.equals(INSTAGRAM))) {
			throw ApiException.proRequired("Locking apps other than Instagram is a PRO feature");
		}
		user.lockedApps.clear();
		user.lockedApps.addAll(clean);
	}

	private String uniqueHandle(String displayName, String email) {
		String base = slug(displayName);
		if (base.length() < 3) {
			base = slug(email.split("@")[0]);
		}
		if (base.length() < 3) {
			base = "dropper";
		}
		if (base.length() > 15) {
			base = base.substring(0, 15);
		}
		String candidate = base;
		while (RESERVED_HANDLES.contains(candidate) || users.existsByHandle(candidate)) {
			candidate = base + (1000 + random.nextInt(9000));
		}
		return candidate;
	}

	public static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	static boolean reservedName(String name) {
		return name.trim().toLowerCase(Locale.ROOT).startsWith(RESERVED_NAME_PREFIX);
	}

	private static String initialName(String displayName, String email) {
		String name = displayName == null ? "" : displayName.trim();
		if (name.isEmpty() || reservedName(name)) {
			name = email.split("@")[0];
		}
		if (reservedName(name)) {
			name = "Dropper";
		}
		return truncate(name, MAX_NAME);
	}

	static String truncate(String value, int max) {
		if (value.length() <= max) {
			return value;
		}
		int end = Character.isHighSurrogate(value.charAt(max - 1)) ? max - 1 : max;
		return value.substring(0, end).trim();
	}

	private static String slug(String value) {
		String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
		return normalized.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", ".").replaceAll("^\\.+|\\.+$", "");
	}

	private String uniqueInviteCode() {
		String code;
		do {
			StringBuilder sb = new StringBuilder();
			for (int i = 0; i < 8; i++) {
				sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
			}
			code = sb.toString();
		}
		while (users.existsByInviteCode(code));
		return code;
	}
}
