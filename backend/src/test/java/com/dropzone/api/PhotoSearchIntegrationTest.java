package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PhotoSearchIntegrationTest extends IntegrationTest {

	@Autowired
	TestFakes.FakePhotos photos;

	@Test
	void searchReturnsPhotosWithCredit() throws Exception {
		Session user = login("Seeker");
		get(user, "/api/v1/photos/search?q= sneakers ").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value("abc_1"))
				.andExpect(jsonPath("$[0].url").value("https://img.test/sneakers-regular"))
				.andExpect(jsonPath("$[0].thumb").value("https://img.test/sneakers-small"))
				.andExpect(jsonPath("$[0].credit.name").value("Ann Lens"))
				.andExpect(jsonPath("$[0].credit.link").value("https://unsplash.com/@ann"));
	}

	@Test
	void searchNeedsTermAndLogin() throws Exception {
		Session user = login("Blank");
		get(user, "/api/v1/photos/search?q= ").andExpect(status().isBadRequest());
		get(user, "/api/v1/photos/search").andExpect(status().isBadRequest());
		get(user, "/api/v1/photos/search?q=" + "a".repeat(101)).andExpect(status().isBadRequest());
		get(null, "/api/v1/photos/search?q=shoes").andExpect(status().isUnauthorized());
	}

	@Test
	void downloadIsTrackedOnlyForValidIds() throws Exception {
		Session user = login("Picker");
		post(user, "/api/v1/photos/Dwu85P9SOIk/download", null).andExpect(status().isNoContent());
		post(user, "/api/v1/photos/bad.id/download", null).andExpect(status().isBadRequest());
		assertThat(photos.downloads).contains("Dwu85P9SOIk").doesNotContain("bad.id");
	}
}
