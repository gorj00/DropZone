package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class QuestSlotsIntegrationTest extends IntegrationTest {

	@Test
	void daysLimitQuestsToChosenWeekdays() throws Exception {
		Session session = login("Weekdays");
		onboardLose(session, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		LocalDate tomorrow = today.plusDays(1);
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(3));

		String meal = questId(session, "HEALTHY_MEAL");
		patch(session, "/api/v1/quests/" + meal, "{\"days\":" + daysExcept(today) + "}").andExpect(status().isOk())
				.andExpect(jsonPath("$.days.length()").value(6));
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(2));
		get(session, "/api/v1/today?date=" + tomorrow).andExpect(jsonPath("$.totalCount").value(3));
		post(session, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photoUrl(session) + "\"}")
				.andExpect(status().isConflict());

		patch(session, "/api/v1/quests/" + meal, "{\"days\":[]}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + meal, "{\"days\":[0,8]}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + questId(session, "WEIGH_IN"), "{\"perDay\":2}").andExpect(status().isBadRequest());
		get(session, "/api/v1/quests").andExpect(jsonPath("$[?(@.code=='HEALTHY_MEAL')].days.length()").value(6));
	}

	@Test
	void eachHealthyMealCountsAsItsOwnQuest() throws Exception {
		Session session = login("Meals");
		onboardLose(session, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		String meal = questId(session, "HEALTHY_MEAL");
		patch(session, "/api/v1/quests/" + meal, "{\"perDay\":3}").andExpect(status().isOk())
				.andExpect(jsonPath("$.perDay").value(3));
		String today = body(get(session, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(5)));
		List<Integer> slots = JsonPath.read(today, "$.quests[?(@.quest.code=='HEALTHY_MEAL')].slot");
		assertThat(slots).containsExactly(1, 2, 3);

		post(session, "/api/v1/quests/" + meal + "/complete", photo(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.slot").value(1)).andExpect(jsonPath("$.slots").value(3))
				.andExpect(jsonPath("$.status").value("DONE"));
		post(session, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photoUrl(session) + "\",\"slot\":3}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.slot").value(3));
		post(session, "/api/v1/quests/" + meal + "/complete", photo(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.slot").value(2));
		post(session, "/api/v1/quests/" + meal + "/complete", photo(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.slot").value(3)).andExpect(jsonPath("$.status").value("DONE"));
		post(session, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photoUrl(session) + "\",\"slot\":4}")
				.andExpect(status().isBadRequest());

		get(session, "/api/v1/today").andExpect(jsonPath("$.doneCount").value(3)).andExpect(jsonPath("$.totalCount").value(5))
				.andExpect(jsonPath("$.unlocked").value(false));
		patch(session, "/api/v1/quests/" + meal, "{\"perDay\":21}").andExpect(status().isBadRequest());
		patch(session, "/api/v1/quests/" + meal, "{\"perDay\":2}").andExpect(status().isOk());
		get(session, "/api/v1/today").andExpect(jsonPath("$.doneCount").value(2)).andExpect(jsonPath("$.totalCount").value(4));
	}

	@Test
	void onboardingAndQuestReplaceAcceptScheduleSettings() throws Exception {
		Session session = login("Settings");
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN","HEALTHY_MEAL"],"lockedApps":["com.instagram.android"],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"HEALTHY_MEAL","perDay":3},{"code":"WEIGH_IN","days":%s}]}
				""".formatted(daysExcept(today))).andExpect(status().isOk());
		get(session, "/api/v1/quests").andExpect(jsonPath("$[?(@.code=='HEALTHY_MEAL')].perDay").value(3))
				.andExpect(jsonPath("$[?(@.code=='WEIGH_IN')].days.length()").value(6));
		get(session, "/api/v1/today").andExpect(jsonPath("$.totalCount").value(3));

		put(session, "/api/v1/quests", """
				{"codes":["WEIGH_IN","HEALTHY_MEAL","STEPS"],"settings":[{"code":"STEPS","days":[1,3,5]}]}
				""").andExpect(status().isOk())
				.andExpect(jsonPath("$[?(@.code=='HEALTHY_MEAL')].perDay").value(3))
				.andExpect(jsonPath("$[?(@.code=='STEPS')].days.length()").value(3));
	}

	@Test
	void dayWithoutScheduledQuestsIsUnlocked() throws Exception {
		Session session = login("Rest");
		onboardLose(session, 2, "WEIGH_IN");
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		patch(session, "/api/v1/quests/" + questId(session, "WEIGH_IN"), "{\"days\":" + daysExcept(today) + "}")
				.andExpect(status().isOk());
		get(session, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.totalCount").value(0))
				.andExpect(jsonPath("$.unlocked").value(true))
				.andExpect(jsonPath("$.unlockedUntil").isNotEmpty());
	}

	@Test
	void squadCheckedMealsAreVerifiedSeparately() throws Exception {
		Session session = loginPro("SquadMeals");
		addFriends(session, 3);
		onboardLose(session, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String meal = questId(session, "HEALTHY_MEAL");
		patch(session, "/api/v1/quests/" + meal, "{\"perDay\":2,\"squadCheck\":true}").andExpect(status().isOk());
		String first = body(post(session, "/api/v1/quests/" + meal + "/complete", photo(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING")));
		String second = body(post(session, "/api/v1/quests/" + meal + "/complete", photo(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING")).andExpect(jsonPath("$.slot").value(2)));
		String firstProof = JsonPath.read(first, "$.proofId");
		String secondProof = JsonPath.read(second, "$.proofId");
		assertThat(firstProof).isNotEqualTo(secondProof);
		get(session, "/api/v1/proofs/" + secondProof).andExpect(status().isOk())
				.andExpect(jsonPath("$.post.title").value("Healthy meal · Meal 2"));
	}

	private String photo(Session session) {
		return "{\"photoUrl\":\"" + photoUrl(session) + "\"}";
	}

	private static String daysExcept(LocalDate day) {
		int skip = day.getDayOfWeek().getValue();
		return IntStream.rangeClosed(1, 7).filter(d -> d != skip).boxed().toList().toString();
	}

	@SuppressWarnings("unchecked")
	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
