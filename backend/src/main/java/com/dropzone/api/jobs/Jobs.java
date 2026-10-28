package com.dropzone.api.jobs;

import com.dropzone.api.billing.BillingService;
import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Tally;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.push.ReminderScheduler;
import com.dropzone.api.storage.UploadCleanup;
import com.dropzone.api.user.InactiveAccounts;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class Jobs {

	public static final String DAILY_REMINDERS = "daily-reminders";
	public static final String TRIAL_REMINDERS = "trial-reminders";
	public static final String DEADLINE_REMINDERS = "deadline-reminders";
	public static final String BILLING_RECONCILE = "billing-reconcile";
	public static final String UPLOAD_SWEEP = "upload-sweep";
	public static final String INACTIVE_ACCOUNTS = "inactive-accounts";
	public static final String NOTIFICATION_RETENTION = "notification-retention";
	public static final Duration UPLOAD_MIN_AGE = Duration.ofDays(2);
	public static final Duration NOTIFICATION_RETENTION_AGE = Duration.ofDays(180);

	private static final Logger log = LoggerFactory.getLogger(Jobs.class);

	private final Map<String, Supplier<Tally>> registry = new LinkedHashMap<>();

	public Jobs(ReminderScheduler reminders, BillingService billing, UploadCleanup uploads, InactiveAccounts inactive,
			NotificationService notifications) {
		registry.put(DAILY_REMINDERS, reminders::remind);
		registry.put(TRIAL_REMINDERS, reminders::remindTrials);
		registry.put(DEADLINE_REMINDERS, reminders::remindDeadlines);
		registry.put(BILLING_RECONCILE, billing::reconcile);
		registry.put(UPLOAD_SWEEP, () -> uploads.sweep(UPLOAD_MIN_AGE));
		registry.put(INACTIVE_ACCOUNTS, inactive::run);
		registry.put(NOTIFICATION_RETENTION, () -> notifications.purgeOlderThan(NOTIFICATION_RETENTION_AGE));
	}

	public Set<String> names() {
		return registry.keySet();
	}

	public JobResult run(String name) {
		Supplier<Tally> job = registry.get(name);
		if (job == null) {
			throw ApiException.notFound("Unknown job " + name);
		}
		long started = System.nanoTime();
		try {
			Tally tally = job.get();
			long ms = Duration.ofNanos(System.nanoTime() - started).toMillis();
			log.info("job={} {} ms={}", name, tally.line(), ms);
			return new JobResult(name, tally.counts(), ms);
		}
		catch (RuntimeException e) {
			log.error("job={} failed after {} ms", name, Duration.ofNanos(System.nanoTime() - started).toMillis(), e);
			throw e;
		}
	}

	public record JobResult(String job, Map<String, Integer> counts, long ms) {
	}
}
