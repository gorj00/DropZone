package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProEndMidDayIntegrationTest extends IntegrationTest {

	@Test
	void aDayClearedBeforeProEndsStaysUnlockedAndFreeQuestsStartTomorrow() throws Exception {
		Session user = loginTrial("MidDay");
		onboardLose(user, 3, "GYM", "SWIM");
		for (String code : List.of("GYM", "SWIM")) {
			post(user, "/api/v1/quests/" + questId(user, code) + "/complete", "{\"photoUrl\":\"%s\"}".formatted(uploadPhoto(user)))
					.andExpect(status().isOk());
		}
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true)).andExpect(jsonPath("$.doneCount").value(2));

		endTrial(user);

		String today = body(get(user, "/api/v1/today").andExpect(status().isOk())
				.andExpect(jsonPath("$.unlocked").value(true))
				.andExpect(jsonPath("$.unlockedUntil").isNotEmpty())
				.andExpect(jsonPath("$.totalCount").value(0)));
		assertThat((List<?>) JsonPath.read(today, "$.quests")).isEmpty();
		String tomorrow = LocalDate.now(ZoneOffset.UTC).plusDays(1).toString();
		String next = body(get(user, "/api/v1/today?date=" + tomorrow).andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(next, "$.quests[*].quest.code")).contains("HEALTHY_MEAL", "STEPS").doesNotContain("GYM", "SWIM");
		assertThat((Integer) JsonPath.read(next, "$.totalCount")).isPositive();

		put(user, "/api/v1/quests", "{\"codes\":[\"HEALTHY_MEAL\"]}").andExpect(status().isOk());
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true))
				.andExpect(jsonPath("$.quests[0].quest.code").value("HEALTHY_MEAL"))
				.andExpect(jsonPath("$.doneCount").value(0));
		get(user, "/api/v1/me").andExpect(jsonPath("$.pro").value(false)).andExpect(jsonPath("$.streak").value(1));
	}

	@Test
	void aDayClearedWithoutProFollowsScheduleChangesAtOnce() throws Exception {
		Session user = login("FreeDay");
		onboardLose(user, 3, "STEPS");
		post(user, "/api/v1/quests/" + questId(user, "STEPS") + "/complete", "{\"value\":9000}").andExpect(status().isOk());
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(true));
		put(user, "/api/v1/quests", "{\"codes\":[\"STEPS\",\"HEALTHY_MEAL\"],\"settings\":[{\"code\":\"HEALTHY_MEAL\",\"perDay\":1}]}")
				.andExpect(status().isOk());
		get(user, "/api/v1/today").andExpect(jsonPath("$.unlocked").value(false)).andExpect(jsonPath("$.totalCount").value(2));
	}

	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		List<String> ids = JsonPath.read(list, "$[?(@.code == '" + code + "')].id");
		return ids.getFirst();
	}
}
