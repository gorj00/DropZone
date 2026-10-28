package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.push.PushType;
import com.dropzone.api.push.ReminderScheduler;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;

class ReminderJobsIntegrationTest extends IntegrationTest {

	@Autowired
	ReminderScheduler scheduler;

	private static String zoneAt(int localHour) {
		int offset = Math.floorMod(localHour - LocalTime.now(ZoneOffset.UTC).getHour() + 11, 24) - 11;
		return offset == 0 ? "UTC" : "UTC%+03d:00".formatted(offset);
	}

	private String withToken(Session user) throws Exception {
		String token = "token-" + UUID.randomUUID();
		put(user, "/api/v1/me/push-token", "{\"token\":\"%s\"}".formatted(token)).andExpect(status().isNoContent());
		return token;
	}

	private Session remindable(String name) throws Exception {
		Session user = login(name);
		onboardLose(user, 3, "WEIGH_IN", "STEPS");
		jdbc.update("update users set timezone = ? where id = ?", zoneAt(18), user.id());
		return user;
	}

	private int notifications(Session user, String type) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Integer.class, user.id(), type);
	}

	@Test
	void dailyReminderGoesOutOncePerUserEvenWhenTheJobRunsTwice() throws Exception {
		Session first = remindable("DailyOne");
		Session second = remindable("DailyTwo");
		String firstToken = withToken(first);
		String secondPhone = withToken(second);
		String secondTablet = withToken(second);

		scheduler.remind();
		scheduler.remind();
		CompletableFuture.allOf(CompletableFuture.runAsync(scheduler::remind), CompletableFuture.runAsync(scheduler::remind)).join();

		assertThat(pushes.toToken(firstToken)).singleElement().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.DAILY_REMINDER);
			assertThat(push.data()).containsEntry("remaining", "2");
		});
		assertThat(pushes.toToken(secondPhone)).hasSize(1);
		assertThat(pushes.toToken(secondTablet)).hasSize(1);
	}

	@Test
	void dailyReminderSkipsOtherHoursAndClearedDays() throws Exception {
		Session morning = login("DailyMorning");
		onboardLose(morning, 3, "WEIGH_IN");
		jdbc.update("update users set timezone = ? where id = ?", zoneAt(7), morning.id());
		String token = withToken(morning);

		scheduler.remind();
		assertThat(pushes.toToken(token)).isEmpty();
	}

	@Test
	void oneFailingUserDoesNotStopTheOthers() throws Exception {
		Session broken = remindable("DailyBroken");
		Session fine = remindable("DailyFine");
		withToken(broken);
		String token = withToken(fine);
		pushes.failingUsers.add(broken.id());
		try {
			scheduler.remind();
		}
		finally {
			pushes.failingUsers.remove(broken.id());
		}
		assertThat(pushes.toToken(token)).hasSize(1);
	}

	@Test
	void trialEndedNoticeGoesOutOnceInTheDaytime() throws Exception {
		Session ended = loginTrial("TrialOver");
		onboardLose(ended, 3, "WEIGH_IN");
		String token = withToken(ended);
		jdbc.update("update users set timezone = ?, trial_ends_at = now() - interval '1 hour' where id = ?", zoneAt(12), ended.id());

		Session night = loginTrial("TrialOverNight");
		onboardLose(night, 3, "WEIGH_IN");
		jdbc.update("update users set timezone = ?, trial_ends_at = now() - interval '1 hour' where id = ?", zoneAt(3), night.id());

		Session paid = loginTrial("TrialOverPaid");
		onboardLose(paid, 3, "WEIGH_IN");
		jdbc.update("update users set timezone = ?, trial_ends_at = now() - interval '1 hour', pro = true where id = ?", zoneAt(12), paid.id());

		Session chosen = loginTrial("TrialOverChosen");
		onboardLose(chosen, 3, "WEIGH_IN");
		jdbc.update("update users set timezone = ?, trial_ends_at = now() - interval '1 hour', trial_end_ack_at = now() where id = ?",
				zoneAt(12), chosen.id());

		scheduler.remindTrials();
		scheduler.remindTrials();

		assertThat(notifications(ended, "TRIAL_ENDED")).isEqualTo(1);
		assertThat(pushes.toToken(token)).singleElement().satisfies(push -> {
			assertThat(push.type()).isEqualTo(PushType.TRIAL_ENDED);
			assertThat(push.data()).containsEntry("link", "/paywall");
		});
		assertThat(notifications(night, "TRIAL_ENDED")).isZero();
		assertThat(notifications(paid, "TRIAL_ENDED")).isZero();
		assertThat(notifications(chosen, "TRIAL_ENDED")).isZero();
	}

	@Test
	void trialEndingNoticeIsClaimedOnceAcrossParallelRuns() throws Exception {
		Session soon = loginTrial("TrialSoonPush");
		onboardLose(soon, 3, "WEIGH_IN");
		String token = withToken(soon);
		jdbc.update("update users set timezone = ?, trial_ends_at = now() + interval '30 hours' where id = ?", zoneAt(12), soon.id());

		CompletableFuture.allOf(CompletableFuture.runAsync(scheduler::remindTrials), CompletableFuture.runAsync(scheduler::remindTrials)).join();
		scheduler.remindTrials();

		assertThat(notifications(soon, "TRIAL_ENDING")).isEqualTo(1);
		assertThat(pushes.toToken(token)).extracting(push -> push.type()).containsExactly(PushType.TRIAL_ENDING);
	}

	@Test
	void theTrialQueryUsesItsIndex() {
		String plan = jdbc.execute((ConnectionCallback<String>) connection -> explain(connection,
				"explain select id from users where trial_ends_at > now() and trial_ends_at <= now() + interval '2 days' and trial_reminded_at is null"));
		assertThat(plan).contains("users_trial_reminder_idx");
	}

	private static String explain(Connection connection, String sql) throws java.sql.SQLException {
		try (Statement statement = connection.createStatement()) {
			statement.execute("set enable_seqscan = off");
			StringBuilder plan = new StringBuilder();
			try (ResultSet rows = statement.executeQuery(sql)) {
				while (rows.next()) {
					plan.append(rows.getString(1)).append('\n');
				}
			}
			statement.execute("reset enable_seqscan");
			return plan.toString();
		}
	}
}
