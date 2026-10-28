package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.storage.UploadCleanup;
import com.jayway.jsonpath.JsonPath;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PhotoCleanupIntegrationTest extends IntegrationTest {

	@Autowired
	private UploadCleanup cleanup;

	private boolean stored(String url) {
		return storage.objects.containsKey(objectName(url));
	}

	@Test
	void transformationPhotosAreDeletedWithTheSetAndWhenReplaced() throws Exception {
		Session user = login("SetCleanup");
		String before = uploadPhoto(user);
		String after = uploadPhoto(user);
		String set = body(post(user, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s"}
				""".formatted(before, after)).andExpect(status().isOk()));
		String id = JsonPath.read(set, "$.id");

		String newAfter = uploadPhoto(user);
		patch(user, "/api/v1/transformations/" + id, "{\"afterUrl\":\"" + newAfter + "\",\"beforeUrl\":\"" + before + "\"}")
				.andExpect(status().isOk());
		assertThat(stored(after)).isFalse();
		assertThat(stored(before)).isTrue();
		assertThat(stored(newAfter)).isTrue();

		delete(user, "/api/v1/transformations/" + id).andExpect(status().isNoContent());
		assertThat(stored(before)).isFalse();
		assertThat(stored(newAfter)).isFalse();
	}

	@Test
	void avatarAndRewardPhotosAreDeletedOnlyWhenNothingElseUsesThem() throws Exception {
		Session user = login("AvatarCleanup");
		String goal = onboardLose(user, 2, "WEIGH_IN");
		String checkpoint = JsonPath.read(goal, "$.goal.checkpoints[0].id");
		String shared = uploadPhoto(user);
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + shared + "\"}").andExpect(status().isOk());
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"" + shared + "\"}").andExpect(status().isOk());

		String avatar = uploadPhoto(user);
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + avatar + "\"}").andExpect(status().isOk());
		assertThat(stored(shared)).isTrue();

		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"https://images.unsplash.com/photo-2?w=1080\"}")
				.andExpect(status().isOk());
		assertThat(stored(shared)).isFalse();
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":null}").andExpect(status().isOk());

		patch(user, "/api/v1/me", "{\"avatarUrl\":\"\"}").andExpect(status().isOk());
		assertThat(stored(avatar)).isFalse();
	}

	@Test
	void sweepRemovesOnlyOldUnreferencedUploads() throws Exception {
		Session user = login("Sweep");
		String referenced = uploadPhoto(user);
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + referenced + "\"}").andExpect(status().isOk());
		String orphan = uploadPhoto(user);
		String fresh = uploadPhoto(user);
		Instant old = Instant.now().minus(3, ChronoUnit.DAYS);
		for (String url : new String[] { referenced, orphan }) {
			storage.created.put(objectName(url), old);
		}

		assertThat(cleanup.sweep(Duration.ofDays(1)).get("deleted")).isGreaterThanOrEqualTo(1);
		assertThat(stored(referenced)).isTrue();
		assertThat(stored(orphan)).isFalse();
		assertThat(stored(fresh)).isTrue();
	}
}
