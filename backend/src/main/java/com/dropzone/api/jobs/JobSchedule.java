package com.dropzone.api.jobs;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "dropzone.jobs.in-process", havingValue = "true", matchIfMissing = true)
public class JobSchedule {

	private final Jobs jobs;

	public JobSchedule(Jobs jobs) {
		this.jobs = jobs;
	}

	@Scheduled(cron = "${dropzone.jobs.hourly-cron:0 0 * * * *}", zone = "UTC")
	public void hourly() {
		runAll(Jobs.DAILY_REMINDERS, Jobs.TRIAL_REMINDERS, Jobs.DEADLINE_REMINDERS);
	}

	@Scheduled(cron = "${dropzone.jobs.daily-cron:0 30 3 * * *}", zone = "UTC")
	public void daily() {
		runAll(Jobs.BILLING_RECONCILE, Jobs.UPLOAD_SWEEP, Jobs.INACTIVE_ACCOUNTS, Jobs.NOTIFICATION_RETENTION);
	}

	private void runAll(String... names) {
		for (String name : names) {
			try {
				jobs.run(name);
			}
			catch (RuntimeException e) {
				continue;
			}
		}
	}
}
