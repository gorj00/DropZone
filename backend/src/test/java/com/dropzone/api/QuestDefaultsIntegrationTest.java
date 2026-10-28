package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class QuestDefaultsIntegrationTest extends IntegrationTest {

	private static final List<Integer> EVERY_DAY = List.of(1, 2, 3, 4, 5, 6, 7);

	@Test
	void catalogCarriesTheDefaults() throws Exception {
		Session session = login("CatalogDefaults");
		String catalog = body(get(session, "/api/v1/quests/catalog").andExpect(status().isOk()));
		assertThat((List<List<Integer>>) JsonPath.read(catalog, "$[?(@.code=='WEIGH_IN')].defaultDays")).containsExactly(List.of(1), List.of(1));
		assertThat((List<Integer>) JsonPath.read(catalog, "$[?(@.multiSlot==true)].defaultPerDay")).containsOnly(3).hasSize(3);
		assertThat((List<Integer>) JsonPath.read(catalog, "$[?(@.multiSlot==false)].defaultPerDay")).containsOnly(1);
		assertThat((List<List<Integer>>) JsonPath.read(catalog, "$[?(@.code=='STEPS')].defaultDays")).containsOnly(EVERY_DAY);
		assertThat((List<Integer>) JsonPath.read(catalog, "$[?(@.code=='CAMERA_REPS')].target")).containsOnly(20);
	}

	@Test
	void onboardingWithoutSettingsUsesTheDefaults() throws Exception {
		Session lose = login("LoseDefaults");
		post(lose, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":2,
				 "questCodes":["WEIGH_IN","HEALTHY_MEAL","STEPS"],"lockedApps":["com.instagram.android"],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		String quests = body(get(lose, "/api/v1/quests").andExpect(status().isOk()));
		assertThat(days(quests, "WEIGH_IN")).isEqualTo(List.of(1));
		assertThat(perDay(quests, "WEIGH_IN")).isEqualTo(1);
		assertThat(days(quests, "HEALTHY_MEAL")).isEqualTo(EVERY_DAY);
		assertThat(perDay(quests, "HEALTHY_MEAL")).isEqualTo(3);
		assertThat(days(quests, "STEPS")).isEqualTo(EVERY_DAY);
		assertThat(perDay(quests, "STEPS")).isEqualTo(1);

		Session gain = loginTrial("GainDefaults");
		post(gain, "/api/v1/onboarding", """
				{"path":"GAIN","metric":"WEIGHT","unit":"kg","startValue":70,"goalValue":78,"checkpoints":2,
				 "questCodes":["WEIGH_IN","PROTEIN_MEAL","EXTRA_MEAL"],"lockedApps":[],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"EXTRA_MEAL","days":[2,4]}]}
				""").andExpect(status().isOk());
		quests = body(get(gain, "/api/v1/quests").andExpect(status().isOk()));
		assertThat(days(quests, "WEIGH_IN")).isEqualTo(List.of(1));
		assertThat(perDay(quests, "PROTEIN_MEAL")).isEqualTo(3);
		assertThat(perDay(quests, "EXTRA_MEAL")).isEqualTo(3);
		assertThat(days(quests, "EXTRA_MEAL")).isEqualTo(List.of(2, 4));
	}

	@Test
	void questsAddedLaterInSettingsGetTheDefaults() throws Exception {
		Session session = login("AddedLater");
		post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":2,
				 "questCodes":["STEPS"],"lockedApps":["com.instagram.android"],"unlockMode":"WHOLE_DAY",
				 "questSettings":[{"code":"STEPS","days":[1,3,5]}]}
				""").andExpect(status().isOk());
		put(session, "/api/v1/quests", "{\"codes\":[\"STEPS\",\"WEIGH_IN\",\"HEALTHY_MEAL\"]}").andExpect(status().isOk());
		String quests = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		assertThat(days(quests, "WEIGH_IN")).isEqualTo(List.of(1));
		assertThat(perDay(quests, "HEALTHY_MEAL")).isEqualTo(3);
		assertThat(days(quests, "STEPS")).isEqualTo(List.of(1, 3, 5));

		put(session, "/api/v1/quests", "{\"codes\":[\"STEPS\",\"HEALTHY_MEAL\"]}").andExpect(status().isOk());
		put(session, "/api/v1/quests", """
				{"codes":["STEPS","HEALTHY_MEAL","WEIGH_IN"],"settings":[{"code":"WEIGH_IN","days":[1,4]}]}
				""").andExpect(status().isOk());
		quests = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		assertThat(days(quests, "WEIGH_IN")).isEqualTo(List.of(1, 4));
	}

	private static List<Integer> days(String quests, String code) {
		List<List<Integer>> all = JsonPath.read(quests, "$[?(@.code=='" + code + "')].days");
		return all.getFirst();
	}

	private static int perDay(String quests, String code) {
		List<Integer> all = JsonPath.read(quests, "$[?(@.code=='" + code + "')].perDay");
		return all.getFirst();
	}
}
