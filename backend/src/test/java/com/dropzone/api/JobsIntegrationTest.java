package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.billing.RevenueCatClient.Entitlement;
import com.dropzone.api.jobs.JobSchedule;
import com.dropzone.api.jobs.Jobs;
import com.dropzone.api.push.PushType;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

class JobsIntegrationTest extends IntegrationTest {

	private static final String GOOGLE = "https://accounts.google.com";

	@Autowired
	ApplicationContext context;

	@Autowired
	Jobs jobs;

	private static String zoneAt(int localHour) {
		int offset = Math.floorMod(localHour - LocalTime.now(ZoneOffset.UTC).getHour() + 11, 24) - 11;
		return offset == 0 ? "UTC" : "UTC%+03d:00".formatted(offset);
	}

	private String pushToken(Session user) throws Exception {
		String token = "token-" + UUID.randomUUID();
		put(user, "/api/v1/me/push-token", "{\"token\":\"%s\"}".formatted(token)).andExpect(status().isNoContent());
		return token;
	}

	@Test
	void onlyTheSchedulerServiceAccountCanRunJobs() throws Exception {
		String name = Jobs.NOTIFICATION_RETENTION;
		job(name, null).andExpect(status().isUnauthorized());
		job(name, "not-a-google-token").andExpect(status().isUnauthorized());
		job(name, jobTokens.token(GOOGLE, "https://someone-else.test", JOBS_INVOKER, true)).andExpect(status().isUnauthorized());
		job(name, jobTokens.token("https://issuer.test", JOBS_AUDIENCE, JOBS_INVOKER, true)).andExpect(status().isUnauthorized());
		job(name, jobTokens.token(GOOGLE, JOBS_AUDIENCE, "intruder@jobs.test", true)).andExpect(status().isForbidden());
		job(name, jobTokens.token(GOOGLE, JOBS_AUDIENCE, JOBS_INVOKER, false)).andExpect(status().isForbidden());
		job(name, login("AppUser").token()).andExpect(status().isUnauthorized());

		String valid = jobTokens.token("accounts.google.com", JOBS_AUDIENCE, JOBS_INVOKER.toUpperCase(), true);
		job("no-such-job", valid).andExpect(status().isNotFound());
		job(name, valid).andExpect(status().isOk()).andExpect(jsonPath("$.job").value(name))
				.andExpect(jsonPath("$.counts.deleted").isNumber()).andExpect(jsonPath("$.ms").isNumber());
	}

	@Test
	void everyJobRunsThroughTheEndpointAndTheScheduleRunsInProcessByDefault() throws Exception {
		assertThat(jobs.names()).containsExactly("daily-reminders", "trial-reminders", "deadline-reminders", "billing-reconcile",
				"upload-sweep", "inactive-accounts", "notification-retention");
		for (String name : jobs.names()) {
			runJob(name);
		}
		assertThat(context.getBeansOfType(JobSchedule.class)).hasSize(1);
	}

	@Test
	void dailyRemindersRunOnce() throws Exception {
		Session user = login("JobDaily");
		onboardLose(user, 3, "WEIGH_IN", "STEPS");
		jdbc.update("update users set timezone = ? where id = ?", zoneAt(18), user.id());
		String token = pushToken(user);
		runJob(Jobs.DAILY_REMINDERS);
		runJob(Jobs.DAILY_REMINDERS);
		assertThat(pushes.toToken(token)).extracting(p -> p.type()).containsExactly(PushType.DAILY_REMINDER);
	}

	@Test
	void trialRemindersRunOnce() throws Exception {
		Session user = loginTrial("JobTrial");
		onboardLose(user, 3, "WEIGH_IN");
		String token = pushToken(user);
		jdbc.update("update users set timezone = ?, trial_ends_at = now() + interval '30 hours' where id = ?", zoneAt(12), user.id());
		runJob(Jobs.TRIAL_REMINDERS);
		runJob(Jobs.TRIAL_REMINDERS);
		assertThat(pushes.toToken(token)).extracting(p -> p.type()).containsExactly(PushType.TRIAL_ENDING);
	}

	@Test
	void deadlineRemindersGoOutOncePerMilestoneThreeDaysAhead() throws Exception {
		Session user = login("JobDeadline");
		String onboarding = onboardLose(user, 3, "WEIGH_IN");
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		String third = JsonPath.read(onboarding, "$.goal.checkpoints[2].id");
		String zone = zoneAt(12);
		jdbc.update("update users set timezone = ? where id = ?", zone, user.id());
		String token = pushToken(user);
		LocalDate today = LocalDate.now(ZoneId.of(zone));
		patch(user, "/api/v1/checkpoints/" + first, "{\"deadline\":\"%s\"}".formatted(today.plusDays(2))).andExpect(status().isOk());
		patch(user, "/api/v1/checkpoints/" + second, "{\"deadline\":\"%s\"}".formatted(today.plusDays(5))).andExpect(status().isOk());
		patch(user, "/api/v1/checkpoints/" + third, "{\"deadline\":\"%s\"}".formatted(today.minusDays(1))).andExpect(status().isOk());

		Session night = login("JobDeadlineNight");
		String nightCheckpoint = JsonPath.read(onboardLose(night, 3, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String nightZone = zoneAt(3);
		jdbc.update("update users set timezone = ? where id = ?", nightZone, night.id());
		String nightToken = pushToken(night);
		patch(night, "/api/v1/checkpoints/" + nightCheckpoint,
				"{\"deadline\":\"%s\"}".formatted(LocalDate.now(ZoneId.of(nightZone)).plusDays(1))).andExpect(status().isOk());

		runJob(Jobs.DEADLINE_REMINDERS);
		runJob(Jobs.DEADLINE_REMINDERS);

		assertThat(pushes.toToken(token)).singleElement().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.DEADLINE_REMINDER);
			assertThat(push.title()).isEqualTo("Milestone 1 is due in 2 days");
			assertThat(push.data()).containsEntry("checkpointId", first).containsEntry("link", "/journey/" + first);
		});
		assertThat(pushes.toToken(nightToken)).isEmpty();

		patch(user, "/api/v1/checkpoints/" + first, "{\"deadline\":\"%s\"}".formatted(today)).andExpect(status().isOk());
		runJob(Jobs.DEADLINE_REMINDERS);
		assertThat(pushes.toToken(token)).extracting(p -> p.title()).containsExactly("Milestone 1 is due in 2 days", "Milestone 1 is due today");
		assertThat(PushType.DEADLINE_REMINDER.channel()).isEqualTo("reminders");
	}

	@Test
	void milestonesPastTheirDeadlineAreOverdueUntilCleared() throws Exception {
		Session user = login("Overdue");
		String onboarding = onboardLose(user, 3, "WEIGH_IN");
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		patch(user, "/api/v1/checkpoints/" + first, "{\"deadline\":\"%s\"}".formatted(today.minusDays(1))).andExpect(status().isOk())
				.andExpect(jsonPath("$.overdue").value(true));
		patch(user, "/api/v1/checkpoints/" + second, "{\"deadline\":\"%s\"}".formatted(today)).andExpect(status().isOk())
				.andExpect(jsonPath("$.overdue").value(false));
		get(user, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].overdue").value(true))
				.andExpect(jsonPath("$.checkpoints[1].overdue").value(false))
				.andExpect(jsonPath("$.checkpoints[2].overdue").value(false));

		post(user, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":86.0}".formatted(uploadPhoto(user)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLEARED")).andExpect(jsonPath("$.overdue").value(false));
	}

	@Test
	void billingReconcileIsIdempotent() throws Exception {
		Session missed = login("JobReconcile");
		jdbc.update("update users set pro = true, will_renew = true, pro_expires_at = now() - interval '2 days' where id = ?", missed.id());
		Instant renewed = Instant.now().plus(28, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
		revenueCat.set(missed.id(), new Entitlement(true, renewed, "dropzone_pro:monthly", true, null));
		try {
			runJob(Jobs.BILLING_RECONCILE);
			runJob(Jobs.BILLING_RECONCILE);
		}
		finally {
			revenueCat.unavailable(missed.id());
		}
		assertThat(jdbc.queryForObject("select pro_expires_at from users where id = ?", Timestamp.class, missed.id()).toInstant())
				.isEqualTo(renewed);
		assertThat(revenueCat.calls(missed.id())).isEqualTo(1);
		assertThat(pushes.to(missed.id())).isEmpty();
	}

	@Test
	void uploadSweepDeletesOrphansOnce() throws Exception {
		Session user = login("JobSweep");
		String kept = uploadPhoto(user);
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"%s\"}".formatted(kept)).andExpect(status().isOk());
		String orphan = uploadPhoto(user);
		String fresh = uploadPhoto(user);
		Instant old = Instant.now().minus(3, ChronoUnit.DAYS);
		for (String url : new String[] { kept, orphan }) {
			storage.created.put(objectName(url), old);
		}
		runJob(Jobs.UPLOAD_SWEEP);
		runJob(Jobs.UPLOAD_SWEEP);
		assertThat(storage.objects).containsKey(objectName(kept));
		assertThat(storage.objects).doesNotContainKey(objectName(orphan));
		assertThat(storage.objects).containsKey(objectName(fresh));
	}

	@Test
	void inactiveAccountsAreWarnedOnceAndDeletedAfterTheWarning() throws Exception {
		Session soon = login("InactiveSoon");
		String soonToken = pushToken(soon);
		jdbc.update("update users set last_seen_at = now() - interval '24 months' + interval '10 days' where id = ?", soon.id());

		Session gone = login("InactiveGone");
		jdbc.update("update users set last_seen_at = now() - interval '25 months', deletion_warned_at = now() - interval '31 days' where id = ?",
				gone.id());
		String goneUpload = uploadPhoto(gone);

		Session justWarned = login("InactiveJustWarned");
		jdbc.update("update users set last_seen_at = now() - interval '25 months', deletion_warned_at = now() - interval '5 days' where id = ?",
				justWarned.id());

		Session neverWarned = login("InactiveNeverWarned");
		String neverWarnedToken = pushToken(neverWarned);
		jdbc.update("update users set last_seen_at = now() - interval '25 months' where id = ?", neverWarned.id());

		Session back = login("InactiveBack");
		jdbc.update("update users set last_seen_at = now() - interval '2 days', deletion_warned_at = now() - interval '40 days' where id = ?",
				back.id());

		Session paying = loginPro("InactivePaying");
		jdbc.update("update users set last_seen_at = now() - interval '25 months', deletion_warned_at = now() - interval '31 days' where id = ?",
				paying.id());

		runJob(Jobs.INACTIVE_ACCOUNTS);
		runJob(Jobs.INACTIVE_ACCOUNTS);

		assertThat(pushes.toToken(soonToken)).singleElement().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.ACCOUNT_DELETION);
			assertThat(push.title()).isEqualTo("Your DropZone account will be deleted soon");
		});
		assertThat(pushes.toToken(neverWarnedToken)).extracting(p -> p.type()).containsExactly(PushType.ACCOUNT_DELETION);
		assertThat(exists(soon)).isTrue();
		assertThat(exists(gone)).isFalse();
		assertThat(storage.hasPrefix("uploads/" + gone.id() + "/")).isFalse();
		assertThat(goneUpload).isNotBlank();
		assertThat(exists(justWarned)).isTrue();
		assertThat(exists(neverWarned)).isTrue();
		assertThat(exists(back)).isTrue();
		assertThat(exists(paying)).isTrue();
		assertThat(PushType.ACCOUNT_DELETION.channel()).isEqualTo("account");
	}

	@Test
	void openingTheAppUpdatesLastSeenAtMostOnceADay() throws Exception {
		Session user = login("LastSeen");
		jdbc.update("update users set last_seen_at = now() - interval '2 days' where id = ?", user.id());
		get(user, "/api/v1/me").andExpect(status().isOk());
		Instant seen = lastSeen(user);
		assertThat(seen).isAfter(Instant.now().minus(1, ChronoUnit.MINUTES));

		jdbc.update("update users set last_seen_at = now() - interval '2 hours' where id = ?", user.id());
		Instant twoHoursAgo = lastSeen(user);
		get(user, "/api/v1/me").andExpect(status().isOk());
		assertThat(lastSeen(user)).isEqualTo(twoHoursAgo);
	}

	@Test
	void notificationsOlderThan180DaysAreDeleted() throws Exception {
		Session user = login("Retention");
		UUID old = UUID.randomUUID();
		UUID recent = UUID.randomUUID();
		jdbc.update("insert into notifications (id, user_id, type, text, created_at) values (?, ?, 'TRIAL_ENDING', 'old', now() - interval '181 days')",
				old, user.id());
		jdbc.update("insert into notifications (id, user_id, type, text, created_at) values (?, ?, 'TRIAL_ENDING', 'new', now() - interval '179 days')",
				recent, user.id());
		runJob(Jobs.NOTIFICATION_RETENTION);
		runJob(Jobs.NOTIFICATION_RETENTION);
		assertThat(jdbc.queryForList("select id from notifications where user_id = ?", UUID.class, user.id())).containsExactly(recent);
	}

	private boolean exists(Session user) {
		return jdbc.queryForObject("select count(*) from users where id = ?", Integer.class, user.id()) == 1;
	}

	private Instant lastSeen(Session user) {
		return jdbc.queryForObject("select last_seen_at from users where id = ?", Timestamp.class, user.id()).toInstant();
	}
}
