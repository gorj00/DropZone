package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class DayRulesIntegrationTest extends IntegrationTest {

	private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

	@Test
	void datesAreLimitedToYesterdayTodayAndTomorrow() throws Exception {
		Session user = login("DateWindow");
		onboardLose(user, 2, "WEIGH_IN", "STEPS");
		String steps = questId(user, "STEPS");
		int[] expected = { 400, 200, 200, 200, 400 };
		for (int offset = -2; offset <= 2; offset++) {
			LocalDate day = today.plusDays(offset);
			post(user, "/api/v1/quests/" + steps + "/complete", "{\"date\":\"%s\",\"value\":9000}".formatted(day))
					.andExpect(status().is(expected[offset + 2]));
			post(user, "/api/v1/weigh-ins", "{\"date\":\"%s\",\"value\":%d}".formatted(day, 89 - offset))
					.andExpect(status().is(expected[offset + 2]));
		}
		assertThat(jdbc.queryForObject("select count(*) from weigh_ins where user_id = ?", Integer.class, user.id())).isEqualTo(3);
		get(user, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(88.0));
		post(user, "/api/v1/weigh-ins", "{\"date\":\"%s\",\"value\":86}".formatted(today.minusDays(1))).andExpect(status().isOk());
		post(user, "/api/v1/weigh-ins", "{\"value\":87}").andExpect(status().isOk());
		get(user, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(88.0));

		Session lifter = login("DateWindowLift");
		post(lifter, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"SIZE","unit":"cm","startValue":35,"goalValue":40,"checkpoints":2,
				 "questCodes":["WEIGH_IN"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		for (int offset = -2; offset <= 2; offset++) {
			post(lifter, "/api/v1/goal/progress", "{\"date\":\"%s\",\"value\":%d}".formatted(today.plusDays(offset), 36 + offset))
					.andExpect(status().is(expected[offset + 2]));
		}
		get(lifter, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(37.0));
		post(lifter, "/api/v1/goal/progress", "{\"date\":\"%s\",\"value\":39}".formatted(today.minusDays(1))).andExpect(status().isOk());
		get(lifter, "/api/v1/goal").andExpect(jsonPath("$.currentValue").value(37.0));
	}

	@Test
	void parallelCompletionsBothCountForTheDay() throws Exception {
		Session user = login("ParallelDay");
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		String steps = questId(user, "STEPS");
		String meal = questId(user, "HEALTHY_MEAL");
		String photo = photoUrl(user);
		List<Integer> statuses = parallel(2, i -> i == 0
				? post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":9000}")
				: post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photo + "\"}"));
		assertThat(statuses).containsExactly(200, 200);
		assertThat(jdbc.queryForMap("select done_count, total_count from daily_results where user_id = ? and day = ?", user.id(), today))
				.containsEntry("done_count", 2).containsEntry("total_count", 3);
		get(user, "/api/v1/today").andExpect(jsonPath("$.doneCount").value(2));
	}

	@Test
	void repeatedCompletionReturnsTheSameResult() throws Exception {
		Session user = login("DoubleTap");
		onboardLose(user, 2, "WEIGH_IN", "STEPS");
		String steps = questId(user, "STEPS");
		List<String> bodies = new ArrayList<>();
		List<Integer> statuses = parallel(2, i -> {
			var result = post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":9000}");
			synchronized (bodies) {
				bodies.add(body(result));
			}
			return result;
		});
		assertThat(statuses).containsExactly(200, 200);
		String first = JsonPath.read(bodies.get(0), "$.completionId");
		String second = JsonPath.read(bodies.get(1), "$.completionId");
		assertThat(first).isNotNull().isEqualTo(second);
	}

	@Test
	void parallelTodayLoadsAddTheFreeQuestsOnce() throws Exception {
		Session user = loginTrial("TrialEnds");
		onboardLose(user, 2, "GYM", "BIKE");
		endTrial(user);
		List<Integer> statuses = parallel(3, i -> get(user, "/api/v1/today"));
		assertThat(statuses).containsExactly(200, 200, 200);
		List<Map<String, Object>> rows = jdbc.queryForList(
				"select code, count(*) as n from user_quests where user_id = ? and active and not custom group by code", user.id());
		assertThat(rows).extracting(r -> r.get("code")).containsExactlyInAnyOrder("GYM", "BIKE", "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		assertThat(rows).extracting(r -> ((Number) r.get("n")).intValue()).containsOnly(1);
		assertThatThrownBy(() -> jdbc.update("""
				insert into user_quests (id, user_id, code, name, icon, grp, proof, active) values (?, ?, 'STEPS', 'Steps', 'steps', 'BURN_FUEL', 'AUTO', true)
				""", UUID.randomUUID(), user.id())).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void questChangesRecomputeTheStoredDay() throws Exception {
		Session user = login("ScheduleEdit");
		onboardLose(user, 2, "WEIGH_IN", "STEPS");
		post(user, "/api/v1/quests/" + questId(user, "STEPS") + "/complete", "{\"value\":9000}").andExpect(status().isOk());
		assertThat(dayResult(user)).containsEntry("done_count", 1).containsEntry("total_count", 2);

		delete(user, "/api/v1/quests/" + questId(user, "WEIGH_IN")).andExpect(status().isNoContent());
		assertThat(dayResult(user)).containsEntry("done_count", 1).containsEntry("total_count", 1);
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true)).andExpect(jsonPath("$.streak").value(1));

		put(user, "/api/v1/quests", "{\"codes\":[\"STEPS\",\"HEALTHY_MEAL\"]}").andExpect(status().isOk());
		assertThat(dayResult(user)).containsEntry("done_count", 1).containsEntry("total_count", 4);
		patch(user, "/api/v1/quests/" + questId(user, "HEALTHY_MEAL"), "{\"perDay\":1}").andExpect(status().isOk());
		assertThat(dayResult(user)).containsEntry("done_count", 1).containsEntry("total_count", 2);
		get(user, "/api/v1/me").andExpect(jsonPath("$.streak").value(0));
	}

	@Test
	void customQuestDaysMustNotContainNull() throws Exception {
		Session user = loginPro("NullDay");
		onboardLose(user, 2, "WEIGH_IN");
		post(user, "/api/v1/quests/custom", """
				{"name":"Stretch","icon":"mobility","proof":"PHOTO","group":"BURN_FUEL","days":[1,null],"squadCheck":false}
				""").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
		patch(user, "/api/v1/quests/" + questId(user, "WEIGH_IN"), "{\"days\":[1,null]}").andExpect(status().isBadRequest());
	}

	@Test
	void gainMealsCanRepeatDuringTheDay() throws Exception {
		Session user = login("ProteinMeals");
		post(user, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"WEIGHT","unit":"kg","startValue":70,"goalValue":78,"checkpoints":2,
				 "questCodes":["WEIGH_IN","PROTEIN_MEAL"],"lockedApps":[],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"PROTEIN_MEAL","perDay":3},{"code":"WEIGH_IN","days":[1,2,3,4,5,6,7]}]}
				""").andExpect(status().isOk());
		String catalog = body(get(user, "/api/v1/quests/catalog").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(catalog, "$[?(@.multiSlot==true)].code"))
				.containsExactlyInAnyOrder("HEALTHY_MEAL", "PROTEIN_MEAL", "EXTRA_MEAL");
		get(user, "/api/v1/quests").andExpect(jsonPath("$[?(@.code=='PROTEIN_MEAL')].perDay").value(3))
				.andExpect(jsonPath("$[?(@.code=='PROTEIN_MEAL')].multiSlot").value(true))
				.andExpect(jsonPath("$[?(@.code=='WEIGH_IN')].multiSlot").value(false));
		String day = body(get(user, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(4)));
		assertThat((List<Integer>) JsonPath.read(day, "$.quests[?(@.quest.code=='PROTEIN_MEAL')].slot")).containsExactly(1, 2, 3);
		patch(user, "/api/v1/quests/" + questId(user, "WEIGH_IN"), "{\"perDay\":2}").andExpect(status().isBadRequest());
	}

	@Test
	void friendsCheckNeedsAPhotoQuest() throws Exception {
		Session user = loginPro("PhotoOnly");
		onboardLose(user, 2, "WEIGH_IN", "STEPS");
		addFriends(user, 3);
		patch(user, "/api/v1/quests/" + questId(user, "STEPS"), "{\"squadCheck\":true}").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("Friends check works only for photo quests"));
		post(user, "/api/v1/quests/custom", """
				{"name":"Water","icon":"drop","proof":"CHECKIN","group":"BURN_FUEL","days":[1,2,3,4,5,6,7],"squadCheck":true}
				""").andExpect(status().isBadRequest());
		String weighIn = questId(user, "WEIGH_IN");
		patch(user, "/api/v1/quests/" + weighIn, "{\"squadCheck\":true}").andExpect(status().isOk());
		post(user, "/api/v1/weigh-ins", "{\"value\":88}").andExpect(status().isOk());
		String day = body(get(user, "/api/v1/today").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(day, "$.quests[?(@.quest.code=='WEIGH_IN')].status")).containsExactly("DONE");
		assertThat(jdbc.queryForObject("select count(*) from feed_items where user_id = ?", Integer.class, user.id())).isZero();
	}

	@Test
	void pastDaysAreNeverReportedAsUnlocked() throws Exception {
		Session user = login("PastUnlock");
		onboardLose(user, 2, "STEPS");
		String steps = questId(user, "STEPS");
		post(user, "/api/v1/quests/" + steps + "/complete", "{\"date\":\"%s\",\"value\":9000}".formatted(today.minusDays(1)))
				.andExpect(status().isOk());
		get(user, "/api/v1/today?date=" + today.minusDays(1)).andExpect(status().isOk())
				.andExpect(jsonPath("$.doneCount").value(1))
				.andExpect(jsonPath("$.totalCount").value(1))
				.andExpect(jsonPath("$.unlocked").value(false));
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(false));
		post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":9000}").andExpect(status().isOk());
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true)).andExpect(jsonPath("$.unlockedUntil").isNotEmpty());
	}

	private Map<String, Object> dayResult(Session session) {
		return jdbc.queryForMap("select done_count, total_count from daily_results where user_id = ? and day = ?", session.id(), today);
	}

	@SuppressWarnings("unchecked")
	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
