package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.zip.CRC32;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class SecurityIntegrationTest extends IntegrationTest {

	@Test
	void devLoginIsOffByDefault() throws Exception {
		call(HttpMethod.POST, null, "/api/v1/auth/dev", "{\"email\":\"dev@test.dev\",\"displayName\":\"Dev\"}")
				.andExpect(status().isNotFound());
	}

	@Test
	void tokensWithWrongSecretIssuerAudienceOrExpiryAreRejected() throws Exception {
		Session user = login("Tokens");
		Instant now = Instant.now();
		List<String> aud = List.of("dropzone-app");
		get(withToken(user, forgeToken(JWT_SECRET, "dropzone", aud, user.id(), 0, now, now.plusSeconds(600))), "/api/v1/me")
				.andExpect(status().isOk());
		get(withToken(user, forgeToken("another-secret-0123456789abcdef0123456789", "dropzone", aud, user.id(), 0, now,
				now.plusSeconds(600))), "/api/v1/me").andExpect(status().isUnauthorized());
		get(withToken(user, forgeToken(JWT_SECRET, "dropzone", aud, user.id(), 0, now.minus(10, ChronoUnit.DAYS),
				now.minus(1, ChronoUnit.DAYS))), "/api/v1/me").andExpect(status().isUnauthorized());
		get(withToken(user, forgeToken(JWT_SECRET, "someone-else", aud, user.id(), 0, now, now.plusSeconds(600))), "/api/v1/me")
				.andExpect(status().isUnauthorized());
		get(withToken(user, forgeToken(JWT_SECRET, "dropzone", null, user.id(), 0, now, now.plusSeconds(600))), "/api/v1/me")
				.andExpect(status().isUnauthorized());
		get(withToken(user, forgeToken(JWT_SECRET, "dropzone", aud, user.id(), null, now, now.plusSeconds(600))), "/api/v1/me")
				.andExpect(status().isUnauthorized());
	}

	@Test
	void issuedTokenCarriesNoEmailAndExpiresInSevenDays() throws Exception {
		Session user = login("Claims");
		String payload = new String(Base64.getUrlDecoder().decode(user.token().split("\\.")[1]), StandardCharsets.UTF_8);
		assertThat(payload).doesNotContain("email").doesNotContain("@test.dev").contains("\"iss\":\"dropzone\"")
				.contains("\"aud\":\"dropzone-app\"").contains("\"ver\":0");
		long iat = ((Number) JsonPath.read(payload, "$.iat")).longValue();
		long exp = ((Number) JsonPath.read(payload, "$.exp")).longValue();
		assertThat(exp - iat).isEqualTo(7L * 24 * 3600);
	}

	@Test
	void tokenOfADeletedUserIsRejected() throws Exception {
		Session user = login("Gone");
		jdbc.update("delete from users where id = ?", user.id());
		get(user, "/api/v1/me").andExpect(status().isUnauthorized());
		get(user, "/api/v1/today").andExpect(status().isUnauthorized());
	}

	@Test
	void signOutEverywhereRevokesOldTokens() throws Exception {
		String sub = "sub-" + UUID.randomUUID();
		String mail = "everywhere-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
		Session first = googleLogin(sub, mail, "Everywhere");
		Session second = googleLogin(sub, mail, "Everywhere");
		post(first, "/api/v1/me/sign-out-everywhere", null).andExpect(status().isNoContent());
		get(first, "/api/v1/me").andExpect(status().isUnauthorized());
		get(second, "/api/v1/me").andExpect(status().isUnauthorized());
		Session fresh = googleLogin(sub, mail, "Everywhere");
		get(fresh, "/api/v1/me").andExpect(status().isOk());
	}

	@Test
	void photoUrlsMustBeOwnUploadsEverywhere() throws Exception {
		Session user = loginPro("Photos");
		Session other = login("PhotoOther");
		String onboarding = onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String checkpoint = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String meal = id(body(get(user, "/api/v1/quests")), "HEALTHY_MEAL");
		String foreign = photoUrl(other);
		String external = "https://tracker.example/pixel.jpg";

		for (String bad : List.of(foreign, external)) {
			post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + bad + "\"}").andExpect(status().isBadRequest());
			post(user, "/api/v1/weigh-ins", "{\"value\":88.0,\"photoUrl\":\"" + bad + "\"}").andExpect(status().isBadRequest());
			post(user, "/api/v1/checkpoints/" + checkpoint + "/proof", "{\"photoUrl\":\"" + bad + "\",\"value\":87.0}")
					.andExpect(status().isBadRequest());
			post(user, "/api/v1/transformations", "{\"beforeUrl\":\"" + bad + "\",\"afterUrl\":\"" + photoUrl(user) + "\"}")
					.andExpect(status().isBadRequest());
			patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"" + bad + "\"}").andExpect(status().isBadRequest());
		}
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"https://images.unsplash.com/photo-1?w=1080\"}")
				.andExpect(status().isOk());
		patch(user, "/api/v1/checkpoints/" + checkpoint, "{\"rewardImageUrl\":\"https://images.unsplash.com.evil.example/x.jpg\"}")
				.andExpect(status().isBadRequest());

		String photo = photoUrl(user);
		post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photo + "\"}").andExpect(status().isOk());
		post(user, "/api/v1/checkpoints/" + checkpoint + "/proof", "{\"photoUrl\":\"" + photo + "\",\"value\":84.0}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("This photo was already used for another proof"));
	}

	@Test
	void uploadsRejectNonImagesHugeImagesAndOversizedFiles() throws Exception {
		Session user = login("Uploads");
		upload(user, new MockMultipartFile("file", "note.txt", "text/plain", "hello".getBytes())).andExpect(status().isBadRequest());
		upload(user, new MockMultipartFile("file", "fake.png", "image/png", new byte[] { (byte) 0x89, 'P', 'N', 'G', 0, 0, 0, 0 }))
				.andExpect(status().isBadRequest());
		upload(user, new MockMultipartFile("file", "bomb.png", "image/png", pngHeader(20000, 20000))).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.message").value("Image is too large (max 4096 px per side)"));
		upload(user, new MockMultipartFile("file", "wide.png", "image/png", png(4097, 1))).andExpect(status().isBadRequest());
		byte[] big = new byte[10 * 1024 * 1024 + 1];
		big[0] = (byte) 0xFF;
		big[1] = (byte) 0xD8;
		big[2] = (byte) 0xFF;
		upload(user, new MockMultipartFile("file", "big.jpg", "image/jpeg", big)).andExpect(status().isBadRequest());
		upload(user, new MockMultipartFile("file", "ok.jpg", "image/jpeg", jpeg(40, 30))).andExpect(status().isOk());
	}

	@Test
	void malformedRequestsAreClientErrors() throws Exception {
		Session user = login("Malformed");
		post(user, "/api/v1/uploads", "{\"file\":\"nope\"}").andExpect(status().isBadRequest());
		mvc.perform(MockMvcRequestBuilders.patch("/api/v1/me").header("Authorization", "Bearer " + user.token())
				.contentType(MediaType.TEXT_PLAIN).content("hello")).andExpect(status().isUnsupportedMediaType());
		onboardLose(user, 2, "WEIGH_IN", "HEALTHY_MEAL", "STEPS");
		String quests = body(get(user, "/api/v1/quests"));
		String meal = id(quests, "HEALTHY_MEAL");
		String steps = id(quests, "STEPS");
		String weighIn = id(quests, "WEIGH_IN");
		post(user, "/api/v1/quests/" + meal + "/complete",
				"{\"photoUrl\":\"" + photoUrl(user) + "\",\"mlText\":\"" + "x".repeat(10_000) + "\"}").andExpect(status().isBadRequest());
		post(user, "/api/v1/quests/" + meal + "/complete", "{\"photoUrl\":\"" + photoUrl(user) + "\",\"mlLabels\":"
				+ List.of("a".repeat(61)).stream().map(s -> "\"" + s + "\"").toList() + "}").andExpect(status().isBadRequest());
		post(user, "/api/v1/quests/" + steps + "/complete", "{\"value\":100001}").andExpect(status().isBadRequest());
		post(user, "/api/v1/quests/" + weighIn + "/complete", "{\"value\":400,\"photoUrl\":\"" + photoUrl(user) + "\"}")
				.andExpect(status().isBadRequest());
		post(user, "/api/v1/weigh-ins", "{\"value\":10}").andExpect(status().isBadRequest());
		post(user, "/api/v1/weigh-ins", "{\"value\":351}").andExpect(status().isBadRequest());
		patch(user, "/api/v1/me", "{\"bio\":\"" + "x".repeat(70_000) + "\"}").andExpect(status().isPayloadTooLarge());
	}

	private static String id(String quests, String code) {
		List<String> ids = JsonPath.read(quests, "$[?(@.code=='" + code + "')].id");
		return ids.getFirst();
	}

	private static byte[] pngHeader(int width, int height) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(new byte[] { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A });
		byte[] ihdr = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte) 8).put((byte) 2).put((byte) 0).put((byte) 0)
				.put((byte) 0).array();
		chunk(out, "IHDR", ihdr);
		chunk(out, "IDAT", new byte[] { 0x78, (byte) 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01 });
		chunk(out, "IEND", new byte[0]);
		return out.toByteArray();
	}

	private static void chunk(ByteArrayOutputStream out, String type, byte[] data) throws Exception {
		out.write(ByteBuffer.allocate(4).putInt(data.length).array());
		byte[] name = type.getBytes(StandardCharsets.US_ASCII);
		out.write(name);
		out.write(data);
		CRC32 crc = new CRC32();
		crc.update(name);
		crc.update(data);
		out.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
	}
}
