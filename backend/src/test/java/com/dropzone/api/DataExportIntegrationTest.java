package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class DataExportIntegrationTest extends IntegrationTest {

	@Test
	void theExportHoldsEverySectionOfMyData() throws Exception {
		Session me = loginPro("Exporter");
		Session friend = loginPro("ExportFriend");
		onboardLose(me, 3, "WEIGH_IN", "HEALTHY_MEAL");
		joinByInvite(friend, me);

		String scale = uploadPhoto(me);
		post(me, "/api/v1/weigh-ins", "{\"value\":89.2,\"photoUrl\":\"%s\"}".formatted(scale)).andExpect(status().isOk());
		post(me, "/api/v1/slip-ups", "{\"type\":\"LATE_SNACK\",\"note\":\"midnight toast\"}").andExpect(status().isOk());
		String before = uploadPhoto(me);
		String after = uploadPhoto(me);
		String set = body(post(me, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","beforeCaption":"Day 1","visibility":"FRIENDS"}
				""".formatted(before, after)).andExpect(status().isOk()));
		String post = JsonPath.read(set, "$.feedItemId");
		post(friend, "/api/v1/feed/" + post + "/comments", "{\"body\":\"Huge change\"}").andExpect(status().isOk());
		post(me, "/api/v1/feed/" + post + "/comments", "{\"body\":\"Thanks!\"}").andExpect(status().isOk());
		post(friend, "/api/v1/feed/" + post + "/hype", null).andExpect(status().isOk());
		post(me, "/api/v1/feed/" + post + "/hype", null).andExpect(status().isOk());
		put(me, "/api/v1/me/push-token", "{\"token\":\"export-device\"}").andExpect(status().isNoContent());

		String export = body(get(me, "/api/v1/me/export").andExpect(status().isOk())
				.andExpect(header().string("Content-Disposition",
						"attachment; filename=\"dropzone-export-" + LocalDate.now(ZoneOffset.UTC) + ".json\"")));

		assertThat((String) JsonPath.read(export, "$.profile.handle")).isEqualTo(me.handle());
		assertThat((String) JsonPath.read(export, "$.profile.email")).startsWith("exporter-");
		assertThat((List<?>) JsonPath.read(export, "$.goals[0].milestones")).hasSize(3);
		assertThat((List<String>) JsonPath.read(export, "$.quests[*].code")).contains("WEIGH_IN", "HEALTHY_MEAL");
		assertThat((List<String>) JsonPath.read(export, "$.completions[*].proof.photoUrl")).contains(scale);
		assertThat((List<?>) JsonPath.read(export, "$.days")).isNotEmpty();
		assertThat((List<Double>) JsonPath.read(export, "$.weighIns[*].value")).contains(89.2);
		assertThat((List<String>) JsonPath.read(export, "$.weighIns[*].photoUrl")).contains(scale);
		assertThat((List<?>) JsonPath.read(export, "$.measurements")).isNotEmpty();
		assertThat((List<String>) JsonPath.read(export, "$.slipUps[*].name")).containsExactly("Late snack");
		assertThat((List<String>) JsonPath.read(export, "$.posts[*].type")).contains("TRANSFORMATION");
		assertThat((List<String>) JsonPath.read(export, "$.comments[*].body")).containsExactly("Thanks!");
		assertThat((List<String>) JsonPath.read(export, "$.transformations[*].beforeUrl")).containsExactly(before);
		assertThat((List<String>) JsonPath.read(export, "$.friends.friends[*].user.id")).containsExactly(friend.id().toString());
		assertThat((List<?>) JsonPath.read(export, "$.friends.incomingRequests")).isEmpty();
		assertThat((List<String>) JsonPath.read(export, "$.notifications[*].type")).contains("COMMENT", "HYPE");
		assertThat((List<String>) JsonPath.read(export, "$.hypes[*].feedItemId")).containsExactly(post);
		assertThat((List<?>) JsonPath.read(export, "$.commentLikes")).isEmpty();
		assertThat((List<?>) JsonPath.read(export, "$.reports")).isEmpty();
		assertThat((List<String>) JsonPath.read(export, "$.devices[*].platform")).containsExactly("ANDROID");
		assertThat((Map<String, Object>) JsonPath.read(export, "$")).containsKeys("exportedAt", "customSlipUpTypes");
		assertThat(export).doesNotContain("export-device");
	}

	@Test
	void suspendedAccountsCanStillDownloadTheirData() throws Exception {
		Session user = login("SuspendedExporter");
		jdbc.update("update users set suspended_at = now() where id = ?", user.id());
		get(user, "/api/v1/today").andExpect(status().isForbidden());
		get(user, "/api/v1/me/export").andExpect(status().isOk());
	}
}
