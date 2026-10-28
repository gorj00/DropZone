package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class PrivatePhotosIntegrationTest extends IntegrationTest {

	@Test
	void uploadsComeBackSignedAndAreStoredCanonical() throws Exception {
		Session user = login("Signed");
		String upload = uploadPhoto(user);
		String plain = canonical(upload);
		assertThat(upload).isEqualTo(signed(plain)).contains("X-Goog-Signature=");

		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + upload + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.avatarUrl").value(upload));
		assertThat(jdbc.queryForObject("select avatar_url from users where id = ?", String.class, user.id())).isEqualTo(plain);
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + plain + "\"}").andExpect(status().isOk());
		assertThat(storage.objects).containsKey(objectName(plain));
		get(user, "/api/v1/me").andExpect(jsonPath("$.avatarUrl").value(upload));

		Session other = login("Thief");
		patch(other, "/api/v1/me", "{\"avatarUrl\":\"" + upload + "\"}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + plain + "?X-Goog-Signature=x/../../other.jpg\"}").andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select avatar_url from users where id = ?", String.class, user.id())).isEqualTo(plain);
	}

	@Test
	void everyResponseWithAnOwnPhotoSignsItButLeavesOtherUrlsAlone() throws Exception {
		Session user = loginPro("Gallery");
		String goal = onboardLose(user, 2, "WEIGH_IN");
		String checkpoint = JsonPath.read(goal, "$.goal.checkpoints[0].id");
		String reward = uploadPhoto(user);
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"" + reward + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.rewardImageUrl").value(reward));
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"" + reward + "\"}").andExpect(status().isOk());
		assertThat(storage.objects).containsKey(objectName(reward));
		assertThat(jdbc.queryForObject("select reward_image_url from checkpoints where id = ?::uuid", String.class, checkpoint))
				.isEqualTo(canonical(reward));

		String before = uploadPhoto(user);
		String after = uploadPhoto(user);
		String set = body(post(user, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"FRIENDS"}
				""".formatted(before, after)).andExpect(status().isOk())
				.andExpect(jsonPath("$.beforeUrl").value(before))
				.andExpect(jsonPath("$.afterUrl").value(after)));
		String setId = JsonPath.read(set, "$.id");
		String postId = JsonPath.read(set, "$.feedItemId");
		patch(user, "/api/v1/transformations/" + setId, "{\"beforeUrl\":\"%s\",\"afterUrl\":\"%s\"}".formatted(before, after))
				.andExpect(status().isOk());
		assertThat(storage.objects).containsKey(objectName(before)).containsKey(objectName(after));
		get(user, "/api/v1/feed/" + postId).andExpect(jsonPath("$.photoUrl").value(after))
				.andExpect(jsonPath("$.transformation.beforeUrl").value(before));

		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"https://images.unsplash.com/photo-9?w=1080&q=80\"}")
				.andExpect(jsonPath("$.rewardImageUrl").value("https://images.unsplash.com/photo-9?w=1080&q=80"));

		String export = body(get(user, "/api/v1/me/export").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(export, "$.transformations[*].beforeUrl")).containsExactly(before);
		assertThat((List<String>) JsonPath.read(export, "$.posts[*].photoUrl")).containsExactly(after);
	}

	@Test
	void friendsAndAdminsSeeSignedPhotosToo() throws Exception {
		Session author = loginPro("Poster");
		Session friend = loginPro("Looker");
		joinByInvite(author, friend);
		String avatar = uploadPhoto(author);
		patch(author, "/api/v1/me", "{\"avatarUrl\":\"" + avatar + "\"}").andExpect(status().isOk());
		String before = uploadPhoto(author);
		String after = uploadPhoto(author);
		String set = body(post(author, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"EVERYONE"}
				""".formatted(before, after)).andExpect(status().isOk()));
		String postId = JsonPath.read(set, "$.feedItemId");

		get(friend, "/api/v1/feed/" + postId).andExpect(jsonPath("$.photoUrl").value(after))
				.andExpect(jsonPath("$.user.avatarUrl").value(avatar))
				.andExpect(jsonPath("$.transformation.afterUrl").value(after));
		get(friend, "/api/v1/social/friends").andExpect(jsonPath("$[0].avatarUrl").value(avatar));

		Session stranger = aged(loginPro("Reporter"));
		post(stranger, "/api/v1/reports", "{\"targetType\":\"POST\",\"targetId\":\"" + postId + "\"}").andExpect(status().isNoContent());
		Session admin = admin();
		get(admin, "/api/v1/admin/reports/POST/" + postId).andExpect(status().isOk())
				.andExpect(jsonPath("$.post.photoUrl").value(after))
				.andExpect(jsonPath("$.post.photos[1]").value(before));
	}
}
