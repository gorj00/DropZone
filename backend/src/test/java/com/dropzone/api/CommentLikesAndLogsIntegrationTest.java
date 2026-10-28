package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class CommentLikesAndLogsIntegrationTest extends IntegrationTest {

	private String set(Session owner) {
		return """
				{"beforeUrl":"%s","afterUrl":"%s","layout":"SPLIT","visibility":"EVERYONE"}
				""".formatted(photoUrl(owner), photoUrl(owner));
	}

	@Test
	void likesToggleCountAndNotifyTheAuthor() throws Exception {
		Session owner = loginPro("LikeOwner");
		Session fan = loginPro("LikeFan");
		Session free = login("LikeFree");
		String itemId = JsonPath.read(body(post(owner, "/api/v1/transformations", set(owner)).andExpect(status().isOk())), "$.feedItemId");
		String commentId = JsonPath.read(body(post(fan, "/api/v1/feed/" + itemId + "/comments", "{\"body\":\"Looking strong\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.likeCount").value(0))
				.andExpect(jsonPath("$.likedByMe").value(false))), "$.id");
		post(fan, "/api/v1/notifications/read", "{}").andExpect(status().isNoContent());

		post(owner, "/api/v1/comments/" + commentId + "/like", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.likeCount").value(1))
				.andExpect(jsonPath("$.likedByMe").value(true));
		get(fan, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].likeCount").value(1))
				.andExpect(jsonPath("$[0].likedByMe").value(false));
		get(owner, "/api/v1/feed/" + itemId + "/comments").andExpect(jsonPath("$[0].likedByMe").value(true));
		get(fan, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(1));
		get(fan, "/api/v1/notifications").andExpect(jsonPath("$[0].type").value("COMMENT_LIKE"))
				.andExpect(jsonPath("$[0].commentId").value(commentId));

		post(owner, "/api/v1/comments/" + commentId + "/like", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.likeCount").value(0))
				.andExpect(jsonPath("$.likedByMe").value(false));
		get(fan, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));

		post(fan, "/api/v1/comments/" + commentId + "/like", null).andExpect(status().isOk())
				.andExpect(jsonPath("$.likeCount").value(1));
		get(fan, "/api/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));

		post(free, "/api/v1/comments/" + commentId + "/like", null).andExpect(status().isPaymentRequired());
		post(owner, "/api/v1/comments/00000000-0000-0000-0000-000000000000/like", null).andExpect(status().isNotFound());
	}

	@Test
	void dailyLogsAreListedByDayAndOnlyVisibleToTheirOwner() throws Exception {
		Session owner = login("LogOwner");
		Session other = login("LogOther");
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		String meal = questId(owner, "HEALTHY_MEAL");
		String photo = photoUrl(owner);
		post(owner, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"%s\",\"mlLabels\":[\"Food\"]}".formatted(photo))
				.andExpect(status().isOk());
		LocalDate today = LocalDate.now(ZoneOffset.UTC);

		String day = body(get(owner, "/api/v1/logs?date=" + today).andExpect(status().isOk())
				.andExpect(jsonPath("$.date").value(today.toString()))
				.andExpect(jsonPath("$.logs.length()").value(1))
				.andExpect(jsonPath("$.logs[0].quest.code").value("HEALTHY_MEAL"))
				.andExpect(jsonPath("$.logs[0].status").value("DONE"))
				.andExpect(jsonPath("$.logs[0].photoUrl").value(signed(photo)))
				.andExpect(jsonPath("$.logs[0].slot").value(1)));
		String logId = JsonPath.read(day, "$.logs[0].id");

		get(owner, "/api/v1/logs/" + logId).andExpect(status().isOk())
				.andExpect(jsonPath("$.log.id").value(logId))
				.andExpect(jsonPath("$.mlLabels[0]").value("Food"))
				.andExpect(jsonPath("$.proofStatus").value("VERIFIED"))
				.andExpect(jsonPath("$.verifiers.length()").value(0));
		get(other, "/api/v1/logs/" + logId).andExpect(status().isNotFound());
		get(other, "/api/v1/logs?date=" + today).andExpect(jsonPath("$.logs.length()").value(0));
		get(owner, "/api/v1/logs?date=" + today.minusDays(3)).andExpect(jsonPath("$.logs.length()").value(0));
	}

	@SuppressWarnings("unchecked")
	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
