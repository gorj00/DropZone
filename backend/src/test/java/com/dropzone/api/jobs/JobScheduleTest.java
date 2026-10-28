package com.dropzone.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class JobScheduleTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withBean(Jobs.class, () -> mock(Jobs.class))
			.withUserConfiguration(JobSchedule.class);

	@Test
	void inProcessScheduleIsOnUnlessSwitchedOff() {
		runner.run(context -> assertThat(context).hasSingleBean(JobSchedule.class));
		runner.withPropertyValues("dropzone.jobs.in-process=true").run(context -> assertThat(context).hasSingleBean(JobSchedule.class));
		runner.withPropertyValues("dropzone.jobs.in-process=false").run(context -> assertThat(context).doesNotHaveBean(JobSchedule.class));
	}

	@Test
	void oneFailingJobDoesNotStopTheRest() {
		Jobs jobs = mock(Jobs.class);
		doThrow(new IllegalStateException("db down")).when(jobs).run(Jobs.BILLING_RECONCILE);
		new JobSchedule(jobs).daily();
		verify(jobs).run(Jobs.UPLOAD_SWEEP);
		verify(jobs).run(Jobs.INACTIVE_ACCOUNTS);
		verify(jobs).run(Jobs.NOTIFICATION_RETENTION);
		new JobSchedule(jobs).hourly();
		verify(jobs).run(Jobs.DAILY_REMINDERS);
		verify(jobs).run(Jobs.TRIAL_REMINDERS);
		verify(jobs).run(Jobs.DEADLINE_REMINDERS);
	}
}
