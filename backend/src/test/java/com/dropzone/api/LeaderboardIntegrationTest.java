package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class LeaderboardIntegrationTest extends IntegrationTest {

	private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

	private Session member(String name) throws Exception {
		Session session = loginPro(name);
		jdbc.update("update users set path = 'LOSE' where id = ?", session.id());
		jdbc.update("delete from measurements where user_id = ?", session.id());
		return session;
	}

	private void weight(Session session, LocalDate day, double value) {
		jdbc.update("insert into measurements (id, user_id, metric, day, value, created_at) values (?, ?, 'WEIGHT', ?, ?, now())",
				UUID.randomUUID(), session.id(), day, value);
	}

	@Test
	void tiesShareARankAndIdleOrImplausibleEntriesAreLeftOut() throws Exception {
		Session me = member("Board Me");
		Session best = member("Board Best");
		Session tie = member("Board Tie");
		Session gainer = member("Board Gainer");
		Session typo = member("Board Typo");
		Session idle = member("Board Idle");
		Session blocked = member("Board Blocked");
		for (Session friend : List.of(best, tie, gainer, typo, idle, blocked)) {
			befriend(me, friend);
		}
		LocalDate before = today.minusDays(10);
		weight(me, before, 90);
		weight(me, today, 89);
		weight(best, before, 90);
		weight(best, today, 88);
		weight(tie, before, 80);
		weight(tie, today, 79);
		weight(gainer, before, 80);
		weight(gainer, today, 82);
		weight(typo, before, 90);
		weight(typo, today, 40);
		weight(idle, before, 70);
		weight(blocked, before, 95);
		weight(blocked, today, 92);
		post(me, "/api/v1/blocks/" + blocked.id(), null).andExpect(status().isNoContent());

		String board = body(get(me, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk())
				.andExpect(jsonPath("$.me").doesNotExist()));
		assertThat((List<String>) JsonPath.read(board, "$.entries[*].user.id"))
				.containsExactly(best.id().toString(), me.id().toString(), tie.id().toString(), gainer.id().toString());
		assertThat((List<Integer>) JsonPath.read(board, "$.entries[*].rank")).containsExactly(1, 2, 2, 4);
		assertThat((List<Double>) JsonPath.read(board, "$.entries[*].delta")).containsExactly(2.0, 1.0, 1.0, -2.0);
	}

	@Test
	void aViewerWithoutRankedFriendsSeesOnlyThemself() throws Exception {
		Session me = member("Lonely");
		Session idle = member("Lonely Friend");
		befriend(me, idle);
		weight(me, today, 90);
		weight(idle, today.minusDays(40), 80);
		get(me, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk())
				.andExpect(jsonPath("$.entries.length()").value(1))
				.andExpect(jsonPath("$.entries[0].user.id").value(me.id().toString()))
				.andExpect(jsonPath("$.me").doesNotExist());

		Session empty = member("Lonely Empty");
		get(empty, "/api/v1/leaderboard?period=WEEK").andExpect(jsonPath("$.entries.length()").value(0));
	}

	@Test
	void theViewerOutsideTheTopTenGetsTheirOwnEntry() throws Exception {
		Session me = member("Eleventh");
		weight(me, today.minusDays(10), 90);
		weight(me, today, 89.9);
		for (int i = 0; i < 11; i++) {
			Session friend = member("Ahead " + i);
			befriend(me, friend);
			weight(friend, today.minusDays(10), 90);
			weight(friend, today, 89.0 - i * 0.1);
		}
		String board = body(get(me, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(board, "$.entries[*].user.id")).hasSize(10).doesNotContain(me.id().toString());
		assertThat((Integer) JsonPath.read(board, "$.me.rank")).isEqualTo(12);
		assertThat((String) JsonPath.read(board, "$.me.user.id")).isEqualTo(me.id().toString());
		assertThat((Double) JsonPath.read(board, "$.me.delta")).isEqualTo(0.1);
	}
}
