package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TrialIntegrationTest extends IntegrationTest {

	@Test
	void theSevenDayTrialStartsWhenOnboardingIsFinishedAndOnlyOnce() throws Exception {
		String email = "trial-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
		String subject = "sub-" + UUID.randomUUID();
		String body = body(googleAuth(google.token(subject, email, true, "Trial", null)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.pro").value(false))
				.andExpect(jsonPath("$.user.trial").value(false))
				.andExpect(jsonPath("$.user.trialEndsAt").isEmpty())
				.andExpect(jsonPath("$.user.trialEndPending").value(false)));
		Session session = new Session(JsonPath.read(body, "$.token"), UUID.fromString(JsonPath.read(body, "$.user.id")),
				JsonPath.read(body, "$.user.handle"), JsonPath.read(body, "$.user.inviteCode"));
		jdbc.update("update users set created_at = now() - interval '3 days' where id = ?", session.id());

		String onboarded = body(post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":3,
				 "questCodes":["WEIGH_IN","GYM","SWIM","HIKE"],"lockedApps":["com.instagram.android","com.zhiliaoapp.musically"],
				 "unlockMode":"MINUTES"}
				""").andExpect(status().isOk())
				.andExpect(jsonPath("$.user.pro").value(true))
				.andExpect(jsonPath("$.user.trial").value(true))
				.andExpect(jsonPath("$.user.unlockMode").value("MINUTES")));
		Instant ends = Instant.parse(JsonPath.read(onboarded, "$.user.trialEndsAt"));
		assertThat(Duration.between(Instant.now(), ends)).isBetween(Duration.ofHours(167), Duration.ofHours(169));

		endTrial(session);
		googleAuth(google.token(subject, email, true, "Trial", null)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.pro").value(false))
				.andExpect(jsonPath("$.user.trial").value(false));

		makePro(session);
		get(session, "/api/v1/me").andExpect(jsonPath("$.pro").value(true)).andExpect(jsonPath("$.trial").value(false));
	}

	@Test
	void existingTrialsAreNotRestartedAndFailedOnboardingStartsNothing() throws Exception {
		Session existing = login("OldTrial");
		Instant before = jdbc.queryForObject("select trial_ends_at from users where id = ?", java.sql.Timestamp.class, existing.id()).toInstant();
		onboardLose(existing, 3, "WEIGH_IN");
		assertThat(jdbc.queryForObject("select trial_ends_at from users where id = ?", java.sql.Timestamp.class, existing.id()).toInstant())
				.isEqualTo(before);
		get(existing, "/api/v1/me").andExpect(jsonPath("$.pro").value(false));

		Session fresh = signUp("NoTrialYet");
		post(fresh, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":3,
				 "questCodes":["NOPE"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isBadRequest());
		assertThat(jdbc.queryForObject("select trial_ends_at from users where id = ?", java.sql.Timestamp.class, fresh.id())).isNull();
	}

	@Test
	void trialUsersCanUseProAndDowngradeKeepsSettingsStored() throws Exception {
		Session session = loginTrial("Downgrade");
		post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":3,
				 "questCodes":["WEIGH_IN","GYM","SWIM"],"lockedApps":["com.instagram.android","com.zhiliaoapp.musically"],
				 "unlockMode":"MINUTES","questSettings":[{"code":"WEIGH_IN","days":[1,2,3,4,5,6,7]}]}
				""").andExpect(status().isOk());
		post(session, "/api/v1/quests/custom", """
				{"name":"Cold shower","icon":"drop","proof":"CHECKIN","group":"RECOVERY","days":[1,2,3,4,5,6,7],"squadCheck":false}
				""").andExpect(status().isOk());
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(4));
		get(session, "/api/v1/stats").andExpect(status().isOk());

		endTrial(session);
		get(session, "/api/v1/me").andExpect(status().isOk())
				.andExpect(jsonPath("$.pro").value(false))
				.andExpect(jsonPath("$.unlockMode").value("WHOLE_DAY"))
				.andExpect(jsonPath("$.lockedApps.length()").value(1))
				.andExpect(jsonPath("$.lockedApps[0]").value("com.instagram.android"));
		String today = body(get(session, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(1))
				.andExpect(jsonPath("$.unlocked").value(false)));
		List<String> codes = JsonPath.read(today, "$.quests[*].quest.code");
		assertThat(codes).containsExactly("WEIGH_IN");
		get(session, "/api/v1/stats").andExpect(status().isPaymentRequired());
		String gym = questId(session, "GYM");
		post(session, "/api/v1/quests/" + gym + "/complete", "{}").andExpect(status().isPaymentRequired());

		makePro(session);
		get(session, "/api/v1/me").andExpect(jsonPath("$.unlockMode").value("MINUTES"))
				.andExpect(jsonPath("$.lockedApps.length()").value(2));
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(4));
	}

	@Test
	void expiredTrialWithOnlyProQuestsFallsBackToFreeOnes() throws Exception {
		Session session = loginTrial("OnlyPro");
		post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":2,
				 "questCodes":["GYM","SWIM"],"lockedApps":["com.instagram.android"],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		endTrial(session);
		boolean monday = LocalDate.now(ZoneOffset.UTC).getDayOfWeek() == DayOfWeek.MONDAY;
		int total = monday ? 5 : 4;
		String today = body(get(session, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(total)));
		List<String> codes = JsonPath.read(today, "$.quests[*].quest.code");
		assertThat(codes.stream().distinct().toList())
				.containsExactlyElementsOf(monday ? List.of("WEIGH_IN", "HEALTHY_MEAL", "STEPS") : List.of("HEALTHY_MEAL", "STEPS"));
		String quests = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		assertThat((List<List<Integer>>) JsonPath.read(quests, "$[?(@.code=='WEIGH_IN')].days")).containsExactly(List.of(1));
		assertThat((List<Integer>) JsonPath.read(quests, "$[?(@.code=='HEALTHY_MEAL')].perDay")).containsExactly(3);
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(total));
	}

	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		List<String> ids = JsonPath.read(list, "$[?(@.code == '" + code + "')].id");
		return ids.getFirst();
	}
}
