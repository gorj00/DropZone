package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class SlipUpsAndAvatarIntegrationTest extends IntegrationTest {

	@Test
	void todaysSlipUpsCanBeListedAndRemovedByTheirOwnerOnly() throws Exception {
		Session owner = loginPro("SlipOwner");
		onboardLose(owner, 2, "WEIGH_IN");
		post(owner, "/api/v1/slip-ups", "{\"type\":\"FAST_FOOD\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Fast food"))
				.andExpect(jsonPath("$.icon").value("burger"));
		String second = body(post(owner, "/api/v1/slip-ups", "{\"type\":\"SWEETS\"}").andExpect(status().isOk()));
		String secondId = JsonPath.read(second, "$.id");

		get(owner, "/api/v1/slip-ups").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[?(@.type == 'SWEETS')].name").value("Sweets binge"));

		Session stranger = loginPro("SlipStranger");
		delete(stranger, "/api/v1/slip-ups/" + secondId).andExpect(status().isNotFound());
		delete(owner, "/api/v1/slip-ups/" + secondId).andExpect(status().isNoContent());
		delete(owner, "/api/v1/slip-ups/" + secondId).andExpect(status().isNotFound());

		get(owner, "/api/v1/slip-ups").andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].type").value("FAST_FOOD"));
		get(owner, "/api/v1/stats").andExpect(status().isOk()).andExpect(jsonPath("$.slipUpCount").value(1));
		get(owner, "/api/v1/slip-ups?date=2020-13-01").andExpect(status().isBadRequest());
	}

	@Test
	void avatarMustBeTheUsersOwnUpload() throws Exception {
		Session user = login("AvatarUser");
		Session other = login("AvatarOther");
		String own = photoUrl(user);

		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + own + "\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.avatarUrl").value(signed(own)));
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + photoUrl(other) + "\"}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + own.replace("/uploads/" + user.id() + "/", "/uploads/" + user.id() + "/../" + other.id() + "/") + "\"}")
				.andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"" + storage.publicUrl("uploads/" + user.id() + "/face.jpg") + "\"}")
				.andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"https://evil.example/face.jpg\"}").andExpect(status().isBadRequest());
		get(user, "/api/v1/me").andExpect(jsonPath("$.avatarUrl").value(signed(own)));
		patch(user, "/api/v1/me", "{\"avatarUrl\":\"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
	}
}
