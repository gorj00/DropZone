package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExProVisibilityIntegrationTest extends IntegrationTest {

	@Test
	void postsAndLeaderboardRowsOfLapsedUsersAreHiddenUntilTheyResubscribe() throws Exception {
		Session author = loginPro("LapsedAuthor");
		Session friend = loginPro("LapsedFriend");
		Session stranger = loginPro("LapsedStranger");
		String onboarding = onboardLose(author, 3, "WEIGH_IN", "HEALTHY_MEAL");
		String friendOnboarding = onboardLose(friend, 3, "WEIGH_IN");
		joinByInvite(friend, author);

		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		patch(author, "/api/v1/checkpoints/" + first, "{\"isPublic\":true}").andExpect(status().isOk());
		patch(author, "/api/v1/checkpoints/" + second, "{\"isPublic\":true}").andExpect(status().isOk());
		post(author, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"%s\",\"value\":86.0}".formatted(uploadPhoto(author)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLEARED"));
		String meal = questId(author, "HEALTHY_MEAL");
		addFriends(author, 3);
		patch(author, "/api/v1/quests/" + meal, "{\"squadCheck\":true}").andExpect(status().isOk());
		String pending = body(post(author, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\"}".formatted(uploadPhoto(author)))
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING")));
		String pendingProof = JsonPath.read(pending, "$.proofId");

		String own = body(get(author, "/api/v1/feed?scope=FRIENDS&limit=50").andExpect(status().isOk()));
		String cleared = ((List<String>) JsonPath.read(own, "$[?(@.type == 'CHECKPOINT_CLEARED')].id")).getFirst();
		String questPost = ((List<String>) JsonPath.read(own, "$[?(@.type == 'QUEST_PROOF')].id")).getFirst();
		String friendSecond = JsonPath.read(friendOnboarding, "$.goal.checkpoints[1].id");

		assertThat(feedIds(friend, "FRIENDS")).contains(cleared, questPost);
		assertThat(feedIds(stranger, "EVERYONE")).contains(cleared);
		assertThat(feedIds(friend, "TO_VERIFY")).contains(questPost);
		long pendingBefore = pendingCount(friend);
		assertThat(leaderboardIds(friend)).contains(author.id().toString());
		get(friend, "/api/v1/checkpoints/" + friendSecond + "/social").andExpect(jsonPath("$.alsoChasing.count").value(1));

		jdbc.update("update users set pro = false where id = ?", author.id());

		assertThat(feedIds(friend, "FRIENDS")).doesNotContain(cleared, questPost);
		assertThat(feedIds(stranger, "EVERYONE")).doesNotContain(cleared);
		assertThat(feedIds(friend, "TO_VERIFY")).doesNotContain(questPost);
		assertThat(pendingCount(friend)).isEqualTo(pendingBefore - 1);
		get(friend, "/api/v1/feed/" + cleared).andExpect(status().isNotFound());
		get(stranger, "/api/v1/feed/" + cleared).andExpect(status().isNotFound());
		post(friend, "/api/v1/feed/" + cleared + "/hype", null).andExpect(status().isNotFound());
		get(friend, "/api/v1/feed/" + cleared + "/comments").andExpect(status().isNotFound());
		post(friend, "/api/v1/proofs/" + pendingProof + "/verify", null).andExpect(status().isNotFound());
		get(friend, "/api/v1/proofs/" + pendingProof).andExpect(status().isOk()).andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("REMOVED"));
		assertThat(leaderboardIds(friend)).doesNotContain(author.id().toString());
		get(friend, "/api/v1/checkpoints/" + friendSecond + "/social").andExpect(jsonPath("$.alsoChasing.count").value(0));
		get(author, "/api/v1/feed/" + cleared).andExpect(status().isOk());
		get(author, "/api/v1/proofs/" + pendingProof).andExpect(jsonPath("$.visible").value(true));

		makePro(author);

		assertThat(feedIds(friend, "FRIENDS")).contains(cleared, questPost);
		assertThat(feedIds(stranger, "EVERYONE")).contains(cleared);
		assertThat(pendingCount(friend)).isEqualTo(pendingBefore);
		get(friend, "/api/v1/feed/" + cleared).andExpect(status().isOk());
		assertThat(leaderboardIds(friend)).contains(author.id().toString());
		get(friend, "/api/v1/checkpoints/" + friendSecond + "/social").andExpect(jsonPath("$.alsoChasing.count").value(1));
	}

	private List<String> feedIds(Session viewer, String scope) throws Exception {
		return JsonPath.read(body(get(viewer, "/api/v1/feed?scope=" + scope + "&limit=50").andExpect(status().isOk())), "$[*].id");
	}

	private long pendingCount(Session viewer) throws Exception {
		return ((Number) JsonPath.read(body(get(viewer, "/api/v1/feed/pending-count").andExpect(status().isOk())), "$.count")).longValue();
	}

	private List<String> leaderboardIds(Session viewer) throws Exception {
		return JsonPath.read(body(get(viewer, "/api/v1/leaderboard?period=WEEK").andExpect(status().isOk())), "$.entries[*].user.id");
	}

	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		List<String> ids = JsonPath.read(list, "$[?(@.code == '" + code + "')].id");
		return ids.getFirst();
	}
}
