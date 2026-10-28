package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.dropzone.api.push.ReminderScheduler;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class TrialReminderIntegrationTest extends IntegrationTest {

	@Autowired
	ReminderScheduler scheduler;

	private void prepare(Session session, String endsIn, boolean subscribed) {
		int offset = Math.floorMod(12 - LocalTime.now(ZoneOffset.UTC).getHour() + 11, 24) - 11;
		String zone = offset == 0 ? "UTC" : "UTC%+03d:00".formatted(offset);
		jdbc.update("update users set onboarded = true, timezone = ?, trial_reminded_at = null, trial_ends_at = now() + cast(? as interval), pro = ? where id = ?",
				zone, endsIn, subscribed, session.id());
	}

	private int trialNotices(Session session) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = 'TRIAL_ENDING'", Integer.class, session.id());
	}

	@Test
	void remindsOnceWhenTheTrialEndsWithinTwoDays() throws Exception {
		Session soon = loginTrial("TrialSoon");
		prepare(soon, "30 hours", false);
		Session later = loginTrial("TrialLater");
		prepare(later, "5 days", false);
		Session paying = loginTrial("TrialPaying");
		prepare(paying, "30 hours", true);

		scheduler.remindTrials();
		scheduler.remindTrials();

		assertThat(trialNotices(soon)).isEqualTo(1);
		assertThat(trialNotices(later)).isZero();
		assertThat(trialNotices(paying)).isZero();
		get(soon, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("TRIAL_ENDING"))
				.andExpect(jsonPath("$[0].text").value(org.hamcrest.Matchers.containsString("1 day")));
	}

	@Test
	void endedTrialAsksForAChoiceUntilFreeIsChosen() throws Exception {
		Session ended = login("TrialEnded");
		get(ended, "/api/v1/me").andExpect(jsonPath("$.trialEndPending").value(true));
		patch(ended, "/api/v1/me", "{\"trialEndAcknowledged\":true}").andExpect(jsonPath("$.trialEndPending").value(false));
		get(ended, "/api/v1/me").andExpect(jsonPath("$.trialEndPending").value(false));

		Session paying = loginPro("TrialEndedPro");
		get(paying, "/api/v1/me").andExpect(jsonPath("$.trialEndPending").value(false));

		Session running = loginTrial("TrialRunning");
		get(running, "/api/v1/me").andExpect(jsonPath("$.trialEndPending").value(false));
	}

	@Test
	void newAccountsGetSevenDaysFromOnboarding() throws Exception {
		Session fresh = signUp("TrialFresh");
		assertThat(jdbc.queryForObject("select trial_ends_at from users where id = ?", java.sql.Timestamp.class, fresh.id())).isNull();
		onboardLose(fresh, 3, "WEIGH_IN");
		double hours = jdbc.queryForObject("select extract(epoch from trial_ends_at - now()) / 3600 from users where id = ?", Double.class,
				fresh.id());
		assertThat(hours).isBetween(7 * 24 - 0.1, 7 * 24 + 0.1);
	}
}
