package com.dropzone.api.push;

import com.dropzone.api.billing.BillingService;
import com.dropzone.api.common.Tally;
import com.dropzone.api.domain.Checkpoint;
import com.dropzone.api.domain.CheckpointRepository;
import com.dropzone.api.domain.CheckpointStatus;
import com.dropzone.api.domain.DailyResult;
import com.dropzone.api.domain.DailyResultRepository;
import com.dropzone.api.domain.Goal;
import com.dropzone.api.domain.GoalRepository;
import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.QuestCompletionRepository;
import com.dropzone.api.domain.QuestStatus;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.progress.ProgressService;
import com.dropzone.api.user.UserService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.IntPredicate;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ReminderScheduler {

	static final int REMINDER_HOUR = 18;
	static final int NOTICE_FROM_HOUR = 9;
	static final int NOTICE_UNTIL_HOUR = 21;
	static final Duration TRIAL_NOTICE = Duration.ofDays(2);
	static final Duration TRIAL_ENDED_WINDOW = Duration.ofDays(3);
	public static final int DEADLINE_NOTICE_DAYS = 3;

	private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

	private final UserRepository userRepository;
	private final UserService users;
	private final ProgressService progress;
	private final DailyResultRepository dailyResults;
	private final CheckpointRepository checkpoints;
	private final GoalRepository goals;
	private final PushService push;
	private final NotificationService notifications;
	private final Clock clock;
	private final TransactionTemplate tx;
	private final QuestCompletionRepository completions;

	public ReminderScheduler(UserRepository userRepository, UserService users, ProgressService progress,
			DailyResultRepository dailyResults, CheckpointRepository checkpoints, GoalRepository goals, PushService push,
			NotificationService notifications, Clock clock, TransactionTemplate tx, QuestCompletionRepository completions) {
		this.userRepository = userRepository;
		this.users = users;
		this.progress = progress;
		this.completions = completions;
		this.dailyResults = dailyResults;
		this.checkpoints = checkpoints;
		this.goals = goals;
		this.push = push;
		this.notifications = notifications;
		this.clock = clock;
		this.tx = tx;
	}

	record Message(User user, PushType type, String title, String body, Map<String, String> data) {
	}

	public Tally remindTrials() {
		Instant now = clock.instant();
		Instant noticeUntil = now.plus(TRIAL_NOTICE);
		Tally tally = run("trial-ending", "users", inZones(userRepository.findTrialEndingZones(now, noticeUntil), this::daytime,
				zones -> userRepository.findTrialEndingIds(now, noticeUntil, zones)), id -> trialEnding(id, now));
		Instant endedFrom = now.minus(TRIAL_ENDED_WINDOW);
		return tally.add(run("trial-ended", "users", inZones(userRepository.findTrialEndedZones(endedFrom, now), this::daytime,
				zones -> userRepository.findTrialEndedIds(endedFrom, now, zones)), id -> trialEnded(id, now)));
	}

	public Tally remind() {
		Map<LocalDate, List<String>> zonesByDay = userRepository.findPushZones().stream()
				.filter(zone -> localTime(zone).getHour() == REMINDER_HOUR)
				.collect(Collectors.groupingBy(zone -> localTime(zone).toLocalDate()));
		List<UUID> ids = new ArrayList<>();
		zonesByDay.forEach((day, zones) -> ids.addAll(userRepository.findDailyReminderIds(zones, day)));
		return run("daily-reminder", "users", ids, this::dailyReminder);
	}

	public Tally remindDeadlines() {
		LocalDate utcToday = LocalDate.now(clock.withZone(ZoneOffset.UTC));
		List<UUID> ids = checkpoints.findDeadlineReminderIds(utcToday.minusDays(1), utcToday.plusDays(DEADLINE_NOTICE_DAYS + 1));
		return run("deadline-reminder", "milestones", ids, this::deadlineReminder);
	}

	private Message trialEnding(UUID id, Instant now) {
		User user = userRepository.findById(id).orElse(null);
		if (user == null || !user.onboarded || user.isSuspended() || user.trialEndsAt == null || !user.trialEndsAt.isAfter(now) || user.isSubscribed(now)
				|| !daytime(localTime(user.timezone).getHour()) || userRepository.claimTrialReminder(id, now) == 0) {
			return null;
		}
		long hours = Math.max(1, Duration.between(now, user.trialEndsAt).toHours());
		String left = hours >= 36 ? "2 days" : hours >= 24 ? "1 day" : hours + (hours == 1 ? " hour" : " hours");
		String text = "Your PRO trial ends in " + left + ". Pick a plan to keep every quest, lock and community feature.";
		notifications.notify(user.id, NotificationType.TRIAL_ENDING, null, null, null, null, text);
		return new Message(user, PushType.TRIAL_ENDING, "Your PRO trial ends in " + left, "Keep every quest, lock and community feature.",
				Map.of());
	}

	private Message trialEnded(UUID id, Instant now) {
		User user = userRepository.findById(id).orElse(null);
		if (user == null || !user.onboarded || user.isSuspended() || user.trialEndsAt == null || user.trialEndsAt.isAfter(now) || user.trialEndAckAt != null
				|| user.hasSubscribed() || !daytime(localTime(user.timezone).getHour()) || userRepository.claimTrialEnded(id, now) == 0) {
			return null;
		}
		notifications.notify(user.id, NotificationType.TRIAL_ENDED, null, null, null, null,
				"Your PRO trial has ended. You're on Free now: pick a plan to get every quest, lock and community feature back.");
		return new Message(user, PushType.TRIAL_ENDED, "Your PRO trial has ended", "Pick a plan to keep every quest, lock and community feature.",
				Map.of("link", BillingService.PAYWALL));
	}

	private Message dailyReminder(UUID id) {
		User user = userRepository.findById(id).orElse(null);
		if (user == null || !user.onboarded || user.isSuspended() || localTime(user.timezone).getHour() != REMINDER_HOUR) {
			return null;
		}
		LocalDate today = users.today(user);
		int total = progress.slotsScheduled(user, today);
		int done = dailyResults.findById(new DailyResult.Key(user.id, today)).map(r -> r.doneCount).orElse(0);
		done += (int) completions.findByUserIdAndDay(user.id, today).stream().filter(c -> c.status == QuestStatus.PENDING).count();
		if (total == 0 || done >= total || userRepository.claimDailyReminder(id, today) == 0) {
			return null;
		}
		int left = total - done;
		return new Message(user, PushType.DAILY_REMINDER, "Your apps are still locked", left + (left == 1 ? " quest" : " quests") + " left to unlock today",
				Map.of("date", today.toString(), "remaining", String.valueOf(left)));
	}

	private Message deadlineReminder(UUID id) {
		Checkpoint cp = checkpoints.findById(id).orElse(null);
		Goal goal = cp == null ? null : goals.findById(cp.goalId).filter(g -> g.active).orElse(null);
		User user = goal == null ? null : userRepository.findById(goal.userId).orElse(null);
		if (user == null || cp.deadline == null || !user.onboarded || user.isSuspended()
				|| (cp.status != CheckpointStatus.ACTIVE && cp.status != CheckpointStatus.LOCKED)) {
			return null;
		}
		ZonedDateTime local = localTime(user.timezone);
		long days = ChronoUnit.DAYS.between(local.toLocalDate(), cp.deadline);
		if (days < 0 || days > DEADLINE_NOTICE_DAYS || !daytime(local.getHour()) || checkpoints.claimDeadlineReminder(id) == 0) {
			return null;
		}
		String due = days == 0 ? "today" : days == 1 ? "tomorrow" : "in " + days + " days";
		String body = cp.rewardTitle == null ? "Send your proof before the deadline." : "Reward: " + cp.rewardTitle;
		return new Message(user, PushType.DEADLINE_REMINDER, "Milestone " + cp.index + " is due " + due, body,
				Map.of("checkpointId", cp.id.toString(), "link", "/journey/" + cp.id));
	}

	private Tally run(String job, String unit, List<UUID> ids, Function<UUID, Message> claim) {
		int sent = 0;
		int failed = 0;
		for (UUID id : ids) {
			try {
				Message message = tx.execute(status -> claim.apply(id));
				if (message != null) {
					push.notify(message.user(), message.type(), message.title(), message.body(), message.data());
					sent++;
				}
			}
			catch (RuntimeException e) {
				failed++;
				log.warn("job={} id={} failed: {}", job, id, e.toString());
			}
		}
		return new Tally().add(unit, ids.size()).add("sent", sent).add("failed", failed);
	}

	private List<UUID> inZones(List<String> zones, IntPredicate hour, Function<Collection<String>, List<UUID>> query) {
		List<String> matching = zones.stream().filter(zone -> hour.test(localTime(zone).getHour())).toList();
		return matching.isEmpty() ? List.of() : query.apply(matching);
	}

	private boolean daytime(int hour) {
		return hour >= NOTICE_FROM_HOUR && hour < NOTICE_UNTIL_HOUR;
	}

	private ZonedDateTime localTime(String zone) {
		return ZonedDateTime.now(clock.withZone(UserService.zone(zone)));
	}
}
