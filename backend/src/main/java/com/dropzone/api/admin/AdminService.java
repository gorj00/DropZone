package com.dropzone.api.admin;

import com.dropzone.api.admin.AdminDtos.Account;
import com.dropzone.api.admin.AdminDtos.Billing;
import com.dropzone.api.admin.AdminDtos.BillingEventView;
import com.dropzone.api.admin.AdminDtos.CheckpointView;
import com.dropzone.api.admin.AdminDtos.CompletionView;
import com.dropzone.api.admin.AdminDtos.Consent;
import com.dropzone.api.admin.AdminDtos.Counts;
import com.dropzone.api.admin.AdminDtos.DayView;
import com.dropzone.api.admin.AdminDtos.ErrorView;
import com.dropzone.api.admin.AdminDtos.GoalView;
import com.dropzone.api.admin.AdminDtos.Health;
import com.dropzone.api.admin.AdminDtos.JobView;
import com.dropzone.api.admin.AdminDtos.Overview;
import com.dropzone.api.admin.AdminDtos.QuestView;
import com.dropzone.api.admin.AdminDtos.SignupDay;
import com.dropzone.api.admin.AdminDtos.SlipUpView;
import com.dropzone.api.admin.AdminDtos.Totals;
import com.dropzone.api.admin.AdminDtos.UserPage;
import com.dropzone.api.admin.AdminDtos.UserRow;
import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.ServerErrors;
import com.dropzone.api.config.CapacityFilter;
import com.dropzone.api.domain.BillingEvent;
import com.dropzone.api.domain.BillingEventRepository;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.JobRun;
import com.dropzone.api.domain.JobRunRepository;
import com.dropzone.api.domain.Measurement;
import com.dropzone.api.domain.MeasurementRepository;
import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.ProofRepository;
import com.dropzone.api.domain.PushTokenRepository;
import com.dropzone.api.domain.QuestCompletion;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.ServerError;
import com.dropzone.api.domain.ServerErrorRepository;
import com.dropzone.api.domain.SlipUp;
import com.dropzone.api.domain.SlipUpRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserQuest;
import com.dropzone.api.domain.UserQuestRepository;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.domain.WeighIn;
import com.dropzone.api.domain.WeighInRepository;
import com.dropzone.api.jobs.Jobs;
import com.dropzone.api.moderation.ModerationService;
import com.dropzone.api.user.UserService;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import java.lang.management.ManagementFactory;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.env.Environment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminService {

	public static final int SIGNUP_DAYS = 30;
	public static final int DEFAULT_LOG_DAYS = 30;
	public static final int MAX_LOG_DAYS = 366;
	public static final int MAX_PAGE = 200;
	public static final int MAX_LIST = 500;
	static final Duration WEEK = Duration.ofDays(7);
	static final Duration DAY = Duration.ofHours(24);
	private static final long MB = 1024 * 1024;

	private final UserService users;
	private final UserRepository userRepository;
	private final ModerationService moderation;
	private final Jobs jobs;
	private final JobRunRepository jobRuns;
	private final ServerErrors serverErrors;
	private final ServerErrorRepository errorRepository;
	private final BillingEventRepository billingEvents;
	private final GoalRepository goals;
	private final CheckpointRepository checkpoints;
	private final UserQuestRepository quests;
	private final QuestCompletionRepository completions;
	private final DailyResultRepository dailyResults;
	private final MeasurementRepository measurements;
	private final WeighInRepository weighIns;
	private final SlipUpRepository slipUps;
	private final ProofRepository proofs;
	private final PushTokenRepository pushTokens;
	private final CapacityFilter capacity;
	private final DataSource dataSource;
	private final ObjectProvider<BuildProperties> build;
	private final Environment env;
	private final JdbcTemplate jdbc;
	private final Clock clock;

	public AdminService(UserService users, UserRepository userRepository, ModerationService moderation, Jobs jobs, JobRunRepository jobRuns,
			ServerErrors serverErrors, ServerErrorRepository errorRepository, BillingEventRepository billingEvents, GoalRepository goals,
			CheckpointRepository checkpoints, UserQuestRepository quests, QuestCompletionRepository completions,
			DailyResultRepository dailyResults, MeasurementRepository measurements, WeighInRepository weighIns, SlipUpRepository slipUps,
			ProofRepository proofs, PushTokenRepository pushTokens, CapacityFilter capacity, DataSource dataSource,
			ObjectProvider<BuildProperties> build, Environment env, JdbcTemplate jdbc, Clock clock) {
		this.users = users;
		this.userRepository = userRepository;
		this.moderation = moderation;
		this.jobs = jobs;
		this.jobRuns = jobRuns;
		this.serverErrors = serverErrors;
		this.errorRepository = errorRepository;
		this.billingEvents = billingEvents;
		this.goals = goals;
		this.checkpoints = checkpoints;
		this.quests = quests;
		this.completions = completions;
		this.dailyResults = dailyResults;
		this.measurements = measurements;
		this.weighIns = weighIns;
		this.slipUps = slipUps;
		this.proofs = proofs;
		this.pushTokens = pushTokens;
		this.capacity = capacity;
		this.dataSource = dataSource;
		this.build = build;
		this.env = env;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public Overview overview(UUID adminId, boolean sandbox) {
		requireAdmin(adminId);
		Instant now = clock.instant();
		List<JobView> jobList = jobs();
		return new Overview(totals(now), signups(now), jobList, jobList.stream().filter(j -> j.failedAt() != null).count(), health(),
				openReports(), errorRepository.countByAtGreaterThanEqual(now.minus(DAY)), billingEvents(10, sandbox));
	}

	@Transactional(readOnly = true)
	public List<JobView> jobs(UUID adminId) {
		requireAdmin(adminId);
		return jobs();
	}

	@Transactional(readOnly = true)
	public UserPage users(UUID adminId, String q, int page, int size) {
		requireAdmin(adminId);
		String pattern = "%" + (q == null ? "" : q.trim().toLowerCase(Locale.ROOT)) + "%";
		Page<User> result = userRepository.adminSearch(pattern,
				PageRequest.of(Math.max(0, page), Math.clamp(size, 1, MAX_PAGE), Sort.by(Sort.Direction.DESC, "createdAt")));
		Instant now = clock.instant();
		return new UserPage(result.getContent().stream().map(u -> row(u, now)).toList(), result.getTotalElements());
	}

	@Transactional(readOnly = true)
	public Account account(UUID adminId, UUID id) {
		requireAdmin(adminId);
		User u = user(id);
		Instant now = clock.instant();
		List<Goal> goalList = goals.findByUserIdOrderByCreatedAtAsc(id);
		List<UUID> goalIds = goalList.stream().map(g -> g.id).toList();
		Map<UUID, List<Checkpoint>> byGoal = goalIds.isEmpty() ? Map.of()
				: checkpoints.findByGoalIdInOrderByIndexAsc(goalIds).stream().collect(Collectors.groupingBy(c -> c.goalId));
		List<GoalView> goalViews = goalList.stream().map(g -> new GoalView(g.id, g.path, g.metric, g.metricLabel, g.unit, g.startValue,
				g.goalValue, g.currentValue, g.active, g.createdAt, g.endedAt, byGoal.getOrDefault(g.id, List.of()).stream()
						.map(c -> new CheckpointView(c.id, c.index, c.targetValue, c.rewardTitle, c.status, c.clearedAt, c.deadline,
								c.verification, c.visibility))
						.toList()))
				.toList();
		List<QuestView> questViews = quests.findByUserIdOrderByCreatedAtAsc(id).stream().map(q -> new QuestView(q.id, q.code, q.name,
				q.icon, q.group, q.proof, q.target, List.copyOf(q.days), q.slots(), q.custom, q.active, q.startsOn, q.createdAt)).toList();
		Counts counts = new Counts(count("feed_items", id), count("comments", id), count("friendships", id), count("daily_results", id),
				pushTokens.findByUserId(id).size());
		Billing billing = new Billing(u.pro, u.proExpiresAt, u.willRenew, u.proProductId, u.billingIssueAt, u.billingHold,
				u.pendingProductId, u.pendingSwitchAt, u.lifetimeAt, u.billingEventAt, u.proEndedAt, u.trialEndsAt);
		Consent consent = new Consent(u.termsVersion, u.privacyVersion, u.termsAcceptedAt, u.ageConfirmedAt, u.regionSource,
				u.regionValue, u.regionEu, u.regionAt);
		return new Account(row(u, now), u.bio, u.weightUnit, u.lengthUnit, u.unlockMode, u.publicByDefault, u.defaultVerification,
				u.bestStreak, u.skipRestDays, u.hiddenFromSearch, u.hiddenFromLeaderboards, billing, consent, counts, goalViews,
				questViews, moderation.reportsAbout(id));
	}

	@Transactional(readOnly = true)
	public List<DayView> days(UUID adminId, UUID id, LocalDate from, LocalDate to) {
		requireAdmin(adminId);
		User u = user(id);
		ZoneId zone = users.zone(u);
		LocalDate end = to == null ? LocalDate.now(clock.withZone(zone)) : to;
		LocalDate start = from == null ? end.minusDays(DEFAULT_LOG_DAYS - 1) : from;
		if (start.isAfter(end)) {
			throw ApiException.validation("from must not be after to");
		}
		if (ChronoUnit.DAYS.between(start, end) >= MAX_LOG_DAYS) {
			throw ApiException.validation("At most " + MAX_LOG_DAYS + " days at a time");
		}
		Map<LocalDate, DailyResult> results = dailyResults.findByUserIdAndDayBetween(id, start, end).stream()
				.collect(Collectors.toMap(r -> r.day, Function.identity()));
		List<QuestCompletion> list = completions.findByUserIdAndDayBetweenOrderByCreatedAtAsc(id, start, end);
		Map<UUID, UserQuest> questById = quests.findAllById(list.stream().map(c -> c.userQuestId).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(q -> q.id, Function.identity()));
		Set<UUID> proofIds = list.stream().map(c -> c.proofId).filter(Objects::nonNull).collect(Collectors.toSet());
		Map<UUID, Proof> proofById = proofIds.isEmpty() ? Map.of()
				: proofs.findAllById(proofIds).stream().collect(Collectors.toMap(p -> p.id, Function.identity()));
		Map<LocalDate, List<QuestCompletion>> completionsByDay = list.stream().collect(Collectors.groupingBy(c -> c.day));
		Map<LocalDate, Double> weightByDay = new HashMap<>();
		for (Measurement m : measurements.findByUserIdAndMetricAndDayBetween(id, Metric.WEIGHT, start, end)) {
			weightByDay.put(m.day, m.value);
		}
		Map<LocalDate, WeighIn> weighInByDay = weighIns.findByUserIdAndDayBetweenOrderByDayAsc(id, start, end).stream()
				.collect(Collectors.toMap(w -> w.day, Function.identity(), (a, b) -> b));
		Map<LocalDate, List<SlipUp>> slipsByDay = slipUps
				.findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(id, start.atStartOfDay(zone).toInstant(),
						end.plusDays(1).atStartOfDay(zone).toInstant())
				.stream().collect(Collectors.groupingBy(s -> LocalDate.ofInstant(s.occurredAt, zone)));
		TreeSet<LocalDate> days = new TreeSet<>();
		days.addAll(results.keySet());
		days.addAll(completionsByDay.keySet());
		days.addAll(weightByDay.keySet());
		days.addAll(weighInByDay.keySet());
		days.addAll(slipsByDay.keySet());
		List<DayView> views = new ArrayList<>();
		for (LocalDate day : days.descendingSet()) {
			DailyResult result = results.get(day);
			WeighIn weighIn = weighInByDay.get(day);
			List<CompletionView> completionViews = completionsByDay.getOrDefault(day, List.of()).stream().map(c -> {
				UserQuest q = questById.get(c.userQuestId);
				Proof p = c.proofId == null ? null : proofById.get(c.proofId);
				return new CompletionView(c.id, q == null ? "Deleted quest" : q.name, q == null ? null : q.icon, c.status, c.slot, c.value,
						c.reps, c.summary, c.createdAt, p == null ? null : p.photoUrl, p == null ? null : p.status);
			}).toList();
			List<SlipUpView> slipViews = slipsByDay.getOrDefault(day, List.of()).stream()
					.map(s -> new SlipUpView(s.type, s.occurredAt, s.note)).toList();
			views.add(new DayView(day, result == null ? null : result.doneCount, result == null ? null : result.totalCount,
					result == null ? null : result.proClearedAt, weightByDay.get(day), weighIn == null ? null : weighIn.photoUrl,
					completionViews, slipViews));
		}
		return views;
	}

	@Transactional(readOnly = true)
	public List<ErrorView> errors(UUID adminId, int limit) {
		requireAdmin(adminId);
		List<ServerError> list = errorRepository.findAllByOrderByAtDesc(PageRequest.of(0, Math.clamp(limit, 1, MAX_LIST)));
		Map<UUID, String> emails = emails(list.stream().map(e -> e.userId).filter(Objects::nonNull).toList());
		return list.stream().map(e -> new ErrorView(e.id, e.at, e.method, e.path, e.exception, e.message, e.userId, emails.get(e.userId),
				e.revision)).toList();
	}

	@Transactional(readOnly = true)
	public List<BillingEventView> billingEvents(UUID adminId, int limit, boolean sandbox) {
		requireAdmin(adminId);
		return billingEvents(Math.clamp(limit, 1, MAX_LIST), sandbox);
	}

	private List<BillingEventView> billingEvents(int limit, boolean sandbox) {
		List<BillingEvent> list = billingEvents.findLatest(sandbox, PageRequest.of(0, limit));
		Map<UUID, String> emails = emails(list.stream().map(e -> parse(e.appUserId)).filter(Objects::nonNull).toList());
		return list.stream().map(e -> new BillingEventView(e.id, e.type, e.appUserId, emails.get(parse(e.appUserId)), e.environment,
				e.receivedAt)).toList();
	}

	private Totals totals(Instant now) {
		OffsetDateTime at = now.atOffset(ZoneOffset.UTC);
		OffsetDateTime week = at.minus(WEEK);
		return jdbc.queryForObject("""
				select count(*) as users, count(*) filter (where onboarded) as onboarded,
				count(*) filter (where pro and (pro_expires_at is null
				or pro_expires_at + (case when will_renew then interval '6 hours' else interval '0' end) > ?)) as subscribed,
				count(*) filter (where trial_ends_at > ? and not pro and pro_ended_at is null) as trial,
				count(*) filter (where suspended_at is not null) as suspended,
				count(*) filter (where created_at >= ?) as new_week,
				count(*) filter (where last_seen_at >= ?) as active_week
				from users
				""", (rs, i) -> new Totals(rs.getLong("users"), rs.getLong("onboarded"), rs.getLong("subscribed"), rs.getLong("trial"),
				rs.getLong("suspended"), rs.getLong("new_week"), rs.getLong("active_week")), at, at, week, week);
	}

	private List<SignupDay> signups(Instant now) {
		LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
		LocalDate from = today.minusDays(SIGNUP_DAYS - 1);
		Map<LocalDate, Long> counts = new HashMap<>();
		jdbc.query("select (created_at at time zone 'UTC')::date as day, count(*) as n from users where created_at >= ? group by 1",
				rs -> {
					counts.put(rs.getObject("day", LocalDate.class), rs.getLong("n"));
				}, from.atStartOfDay().atOffset(ZoneOffset.UTC));
		List<SignupDay> list = new ArrayList<>();
		for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
			list.add(new SignupDay(day, counts.getOrDefault(day, 0L)));
		}
		return list;
	}

	private List<JobView> jobs() {
		Map<String, JobRun> runs = jobRuns.findAll().stream().collect(Collectors.toMap(r -> r.name, Function.identity()));
		return jobs.names().stream().map(name -> {
			JobRun run = runs.get(name);
			return new JobView(name, run == null ? null : run.lastRunAt, run == null ? null : run.failedAt, run == null ? null : run.error);
		}).toList();
	}

	private Health health() {
		HikariPoolMXBean pool = dataSource instanceof HikariDataSource hikari ? hikari.getHikariPoolMXBean() : null;
		int poolMax = dataSource instanceof HikariDataSource hikari ? hikari.getMaximumPoolSize() : 0;
		Runtime runtime = Runtime.getRuntime();
		BuildProperties props = build.getIfAvailable();
		return new Health(serverErrors.lastWindow(), capacity.busyLastWindow(), capacity.databaseWaitsLastWindow(), capacity.inFlight(),
				pool == null ? 0 : pool.getActiveConnections(), pool == null ? 0 : pool.getIdleConnections(),
				pool == null ? 0 : pool.getThreadsAwaitingConnection(), poolMax, (runtime.totalMemory() - runtime.freeMemory()) / MB,
				runtime.maxMemory() / MB, Instant.ofEpochMilli(ManagementFactory.getRuntimeMXBean().getStartTime()),
				props == null ? null : props.getVersion(), env.getProperty("GIT_SHA"), env.getProperty("K_REVISION"));
	}

	private long openReports() {
		Long count = jdbc.queryForObject("select count(*) from (select distinct target_type, target_id from reports) r", Long.class);
		return count == null ? 0 : count;
	}

	private long count(String table, UUID userId) {
		Long count = jdbc.queryForObject("select count(*) from " + table + " where user_id = ?", Long.class, userId);
		return count == null ? 0 : count;
	}

	private Map<UUID, String> emails(Collection<UUID> ids) {
		return ids.isEmpty() ? Map.of() : userRepository.findByIdIn(ids).stream().collect(Collectors.toMap(u -> u.id, u -> u.email));
	}

	private static UUID parse(String value) {
		try {
			return value == null ? null : UUID.fromString(value);
		}
		catch (IllegalArgumentException e) {
			return null;
		}
	}

	private UserRow row(User u, Instant now) {
		return new UserRow(u.id, u.email, u.displayName, u.handle, u.avatarUrl, u.path, u.onboarded, u.isSubscribed(now),
				u.isTrialActive(now), u.trialEndsAt, u.proExpiresAt, u.proProductId, u.isSuspended(), u.moderationStrikes, u.streak,
				u.createdAt, u.lastSeenAt, u.timezone, users.isAdmin(u));
	}

	private User user(UUID id) {
		return userRepository.findById(id).orElseThrow(() -> ApiException.notFound("User not found"));
	}

	private void requireAdmin(UUID adminId) {
		users.requireAdmin(users.get(adminId));
	}
}
