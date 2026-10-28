package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class StreakAndCleanDaysIntegrationTest extends IntegrationTest {

	private void day(Session user, LocalDate day, int done, int total) {
		jdbc.update("insert into daily_results (user_id, day, done_count, total_count) values (?, ?, ?, ?)", user.id(), day, done, total);
	}

	@Test
	void restDaysBreakTheStreakUnlessTheUserSkipsThem() throws Exception {
		Session user = login("RestDays");
		onboardLose(user, 3, "STEPS");
		LocalDate today = LocalDate.now(ZoneOffset.UTC);
		int restWeekday = today.minusDays(1).getDayOfWeek().getValue();
		String days = IntStream.rangeClosed(1, 7).filter(d -> d != restWeekday).mapToObj(String::valueOf).collect(Collectors.joining(","));
		jdbc.update("update user_quests set days = ? where user_id = ? and active", days, user.id());
		jdbc.update("update users set created_at = now() - interval '30 days' where id = ?", user.id());
		day(user, today.minusDays(2), 1, 1);
		day(user, today.minusDays(3), 1, 1);
		day(user, today.minusDays(4), 0, 0);
		day(user, today.minusDays(5), 1, 1);
		day(user, today.minusDays(7), 1, 1);

		get(user, "/api/v1/me").andExpect(jsonPath("$.skipRestDays").value(false)).andExpect(jsonPath("$.streak").value(0));
		patch(user, "/api/v1/me", "{\"skipRestDays\":true}").andExpect(status().isOk())
				.andExpect(jsonPath("$.skipRestDays").value(true)).andExpect(jsonPath("$.streak").value(3));
		get(user, "/api/v1/me").andExpect(jsonPath("$.streak").value(3)).andExpect(jsonPath("$.bestStreak").value(3));

		patch(user, "/api/v1/me", "{\"skipRestDays\":false}").andExpect(status().isOk())
				.andExpect(jsonPath("$.skipRestDays").value(false)).andExpect(jsonPath("$.streak").value(0))
				.andExpect(jsonPath("$.bestStreak").value(3));
	}

	@Test
	void cleanDaysAreClearedDaysWithoutSlipUpsWhileTrackingIsOn() throws Exception {
		Session idle = loginPro("NoActivity");
		YearMonth month = YearMonth.now(ZoneOffset.UTC).minusMonths(1);
		jdbc.update("update users set created_at = now() - interval '70 days' where id = ?", idle.id());
		get(idle, "/api/v1/stats?month=" + month).andExpect(status().isOk()).andExpect(jsonPath("$.cleanDays").value(0));

		Session user = loginPro("CleanDays");
		jdbc.update("update users set created_at = now() - interval '70 days' where id = ?", user.id());
		day(user, month.atDay(1), 2, 2);
		day(user, month.atDay(2), 2, 2);
		day(user, month.atDay(3), 1, 2);
		jdbc.update("insert into slip_ups (id, user_id, type, occurred_at) values (?, ?, 'LATE_SNACK', ?)", UUID.randomUUID(), user.id(),
				java.sql.Timestamp.from(month.atDay(2).atTime(12, 0).toInstant(ZoneOffset.UTC)));

		get(user, "/api/v1/stats?month=" + month).andExpect(jsonPath("$.cleanDays").value(1)).andExpect(jsonPath("$.slipUpCount").value(1));
		patch(user, "/api/v1/me", "{\"slipUpTracking\":false}").andExpect(status().isOk());
		get(user, "/api/v1/stats?month=" + month).andExpect(jsonPath("$.cleanDays").value(0)).andExpect(jsonPath("$.slipUpCount").value(1));
	}

	@Test
	void slipUpTrackingIsOnlyADisplaySetting() throws Exception {
		Session user = loginPro("TrackingOff");
		patch(user, "/api/v1/me", "{\"slipUpTracking\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.slipUpTracking").value(false));
		post(user, "/api/v1/slip-ups", "{\"type\":\"SWEETS\"}").andExpect(status().isOk());
		String list = body(get(user, "/api/v1/slip-ups").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(list, "$[*].type")).containsExactly("SWEETS");
		get(user, "/api/v1/stats").andExpect(jsonPath("$.slipUpCount").value(1)).andExpect(jsonPath("$.cleanDays").value(0));
	}
}
