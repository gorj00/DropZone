package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dropzone.api.moderation.ImageCheck;
import com.dropzone.api.moderation.SafeSearch.Likelihood;
import com.dropzone.api.moderation.SafeSearch.Verdict;
import com.dropzone.api.push.PushType;
import com.jayway.jsonpath.JsonPath;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockMultipartFile;

class ModerationRulesIntegrationTest extends IntegrationTest {

	private static final SecureRandom RANDOM = new SecureRandom();
	private static final Verdict ADULT = new Verdict(Likelihood.LIKELY, Likelihood.POSSIBLE);
	private static final Verdict RACY = new Verdict(Likelihood.UNLIKELY, Likelihood.VERY_LIKELY);
	private static final Verdict BORDERLINE = new Verdict(Likelihood.POSSIBLE, Likelihood.POSSIBLE);

	private String uniquePhoto(Session session) throws Exception {
		BufferedImage image = new BufferedImage(6 + RANDOM.nextInt(20), 6 + RANDOM.nextInt(20), BufferedImage.TYPE_INT_RGB);
		Color color = new Color(RANDOM.nextInt(0xFFFFFF));
		for (int x = 0; x < image.getWidth(); x++) {
			for (int y = 0; y < image.getHeight(); y++) {
				image.setRGB(x, y, (x + y) % 3 == 0 ? RANDOM.nextInt(0xFFFFFF) : color.getRGB());
			}
		}
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, "png", out);
		return JsonPath.read(body(upload(session, new MockMultipartFile("file", "photo.png", "image/png", out.toByteArray()))
				.andExpect(status().isOk())), "$.url");
	}

	private byte[] stored(String url) {
		return storage.objects.get(objectName(url));
	}

	private String transformation(Session owner, String before, String after, String visibility) throws Exception {
		return body(post(owner, "/api/v1/transformations", """
				{"beforeUrl":"%s","afterUrl":"%s","visibility":"%s"}
				""".formatted(before, after, visibility)).andExpect(status().isOk()));
	}

	private int adminAlerts(Session admin, String feedItemId, String text) {
		return jdbc.queryForObject("""
				select count(*) from notifications where user_id = ? and type = 'ADMIN_REPORT' and feed_item_id = ?::uuid and text like ?
				""", Integer.class, admin.id(), feedItemId, text + "%");
	}

	private void report(Session reporter, String postId, String reason) throws Exception {
		post(reporter, "/api/v1/reports", """
				{"targetType":"POST","targetId":"%s","reason":"%s"}
				""".formatted(postId, reason)).andExpect(status().isNoContent());
	}

	private void pushToken(Session session) throws Exception {
		put(session, "/api/v1/me/push-token", "{\"token\":\"tok-%s\"}".formatted(UUID.randomUUID())).andExpect(status().isNoContent());
	}

	@Test
	void adultPhotosThatBecomePublicAreHiddenForReviewAndAdminsAreAlerted() throws Exception {
		Session admin = admin();
		pushToken(admin);
		Session owner = loginPro("ImageOwner");
		Session stranger = loginPro("ImageStranger");
		String before = uniquePhoto(owner);
		safeSearch.flag(stored(before), ADULT);

		String set = transformation(owner, before, uniquePhoto(owner), "EVERYONE");
		String setId = JsonPath.read(set, "$.id");
		String postId = JsonPath.read(set, "$.feedItemId");
		assertThat((String) JsonPath.read(set, "$.moderation")).isEqualTo("UNDER_REVIEW");
		assertThat(safeSearch.wasChecked(stored(before))).isTrue();
		get(owner, "/api/v1/feed/" + postId).andExpect(jsonPath("$.hidden").value(true)).andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isNotFound());
		assertThat((List<String>) JsonPath.read(body(get(stranger, "/api/v1/feed?scope=EVERYONE&limit=50")), "$[*].id")).doesNotContain(postId);
		assertThat(adminAlerts(admin, postId, "Hidden by the image check")).isEqualTo(1);
		assertThat(pushes.to(admin.id(), PushType.ADMIN_REPORT).stream().filter(p -> postId.equals(p.data().get("targetId")))).hasSize(1);

		String queue = body(get(admin, "/api/v1/admin/reports").andExpect(status().isOk()));
		assertThat((List<Boolean>) JsonPath.read(queue, "$[?(@.targetId=='" + postId + "')].hidden")).containsExactly(true);
		assertThat((List<List<String>>) JsonPath.read(queue, "$[?(@.targetId=='" + postId + "')].reasons"))
				.containsExactly(List.of("Image check: adult LIKELY, racy POSSIBLE"));
		get(admin, "/api/v1/admin/reports/POST/" + postId).andExpect(status().isOk()).andExpect(jsonPath("$.hidden").value(true))
				.andExpect(jsonPath("$.reports[0].reporter").doesNotExist());

		post(admin, "/api/v1/admin/reports/POST/" + postId + "/restore", null).andExpect(status().isNoContent());
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isOk());
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"FRIENDS\"}").andExpect(status().isOk());
		patch(owner, "/api/v1/transformations/" + setId, "{\"visibility\":\"EVERYONE\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.moderation").doesNotExist());
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isOk());
	}

	@Test
	void onlyPhotosVisibleToEveryoneAreCheckedAndOnlyLikelyNudityHides() throws Exception {
		Session owner = loginPro("ScopeOwner");
		String after = uniquePhoto(owner);
		safeSearch.flag(stored(after), ADULT);
		String set = transformation(owner, uniquePhoto(owner), after, "FRIENDS");
		assertThat((Object) JsonPath.read(set, "$.moderation")).isNull();
		assertThat(safeSearch.wasChecked(stored(after))).isFalse();

		patch(owner, "/api/v1/transformations/" + JsonPath.read(set, "$.id"), "{\"visibility\":\"EVERYONE\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		assertThat(safeSearch.wasChecked(stored(after))).isTrue();

		String borderline = uniquePhoto(owner);
		safeSearch.flag(stored(borderline), BORDERLINE);
		String visible = transformation(owner, uniquePhoto(owner), borderline, "EVERYONE");
		assertThat(safeSearch.wasChecked(stored(borderline))).isTrue();
		assertThat((Object) JsonPath.read(visible, "$.moderation")).isNull();

		String shirtless = uniquePhoto(owner);
		safeSearch.flag(stored(shirtless), RACY);
		String revealing = transformation(owner, uniquePhoto(owner), shirtless, "EVERYONE");
		assertThat(safeSearch.wasChecked(stored(shirtless))).isTrue();
		assertThat((Object) JsonPath.read(revealing, "$.moderation")).isNull();

		String replaced = uniquePhoto(owner);
		safeSearch.flag(stored(replaced), ADULT);
		patch(owner, "/api/v1/transformations/" + JsonPath.read(visible, "$.id"), "{\"afterUrl\":\"" + replaced + "\"}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
	}

	@Test
	void publicQuestProofsWithAnAdultPhotoAreHiddenAndSendNoVerifyRequest() throws Exception {
		Session owner = loginPro("QuestImageOwner");
		Session friend = loginPro("QuestImageFriend");
		befriend(owner, friend);
		pushToken(friend);
		onboardLose(owner, 2, "WEIGH_IN");
		String quest = JsonPath.read(body(post(owner, "/api/v1/quests/custom", """
				{"name":"Beach run","icon":"drop","proof":"PHOTO","group":"BEAT_BINGE","days":[1,2,3,4,5,6,7],"squadCheck":true,
				 "checkAudience":"EVERYONE"}
				""").andExpect(status().isOk())), "$.id");
		String photo = uniquePhoto(owner);
		safeSearch.flag(stored(photo), ADULT);
		String proofId = JsonPath.read(body(post(owner, "/api/v1/quests/" + quest + "/complete", "{\"photoUrl\":\"" + photo + "\"}")
				.andExpect(jsonPath("$.status").value("PENDING"))), "$.proofId");

		get(owner, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		get(friend, "/api/v1/proofs/" + proofId).andExpect(jsonPath("$.visible").value(false))
				.andExpect(jsonPath("$.reason").value("UNDER_REVIEW"));
		assertThat((List<String>) JsonPath.read(body(get(friend, "/api/v1/feed?scope=TO_VERIFY&limit=50")), "$[*].proofId"))
				.doesNotContain(proofId);
		assertThat(pushes.to(friend.id(), PushType.VERIFY_REQUEST)).isEmpty();
	}

	@Test
	void publicMilestonePostsAreCheckedForTheScalePhotoAndTheRewardPhoto() throws Exception {
		Session community = loginPro("MilestoneImageCommunity");
		patch(community, "/api/v1/me", "{\"publicByDefault\":true,\"defaultVerification\":\"COMMUNITY\"}").andExpect(status().isOk());
		String first = JsonPath.read(onboardLose(community, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String scale = uniquePhoto(community);
		safeSearch.flag(stored(scale), ADULT);
		post(community, "/api/v1/checkpoints/" + first + "/proof", "{\"photoUrl\":\"" + scale + "\",\"value\":84.9}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING_VERIFICATION"))
				.andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));

		Session ai = loginPro("MilestoneImageReward");
		patch(ai, "/api/v1/me", "{\"publicByDefault\":true}").andExpect(status().isOk());
		String milestone = JsonPath.read(onboardLose(ai, 2, "WEIGH_IN"), "$.goal.checkpoints[0].id");
		String reward = uniquePhoto(ai);
		safeSearch.flag(stored(reward), ADULT);
		patch(ai, "/api/v1/checkpoints/" + milestone, "{\"rewardTitle\":\"Swimsuit\",\"rewardImageUrl\":\"" + reward + "\"}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.moderation").doesNotExist());
		post(ai, "/api/v1/checkpoints/" + milestone + "/proof", "{\"photoUrl\":\"" + uniquePhoto(ai) + "\",\"value\":84.9}")
				.andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLEARED"));
		get(ai, "/api/v1/goal").andExpect(jsonPath("$.checkpoints[0].moderation").value("UNDER_REVIEW"));
		assertThat(safeSearch.wasChecked(stored(reward))).isTrue();
	}

	@Test
	void aFailedImageCheckPublishesThePhotoAndLogs() throws Exception {
		Logger logger = (Logger) LoggerFactory.getLogger(ImageCheck.class);
		ListAppender<ILoggingEvent> logs = new ListAppender<>();
		logs.start();
		logger.addAppender(logs);
		try {
			Session owner = loginPro("VisionDownOwner");
			Session stranger = loginPro("VisionDownStranger");
			String photo = uniquePhoto(owner);
			safeSearch.fail(stored(photo));
			String set = transformation(owner, uniquePhoto(owner), photo, "EVERYONE");
			assertThat((Object) JsonPath.read(set, "$.moderation")).isNull();
			get(stranger, "/api/v1/feed/" + JsonPath.read(set, "$.feedItemId")).andExpect(status().isOk());
			assertThat(logs.list).anyMatch(e -> e.getLevel() == Level.WARN && e.getFormattedMessage().contains("Image check failed")
					&& e.getFormattedMessage().contains(objectName(photo)));
		}
		finally {
			logger.detachAppender(logs);
		}
	}

	@Test
	void oneNudityReportHidesAPhotoPostUntilAnAdminDecides() throws Exception {
		Session admin = admin();
		Session owner = loginPro("NudityOwner");
		Session stranger = loginPro("NudityStranger");
		String postId = JsonPath.read(transformation(owner, uniquePhoto(owner), uniquePhoto(owner), "EVERYONE"), "$.feedItemId");

		report(loginPro("NudityNewcomer"), postId, "Nudity");
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isOk());

		report(aged(loginPro("NudityReporter")), postId, "Nudity");
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isNotFound());
		get(owner, "/api/v1/feed/" + postId).andExpect(jsonPath("$.moderation").value("UNDER_REVIEW"));
		assertThat(adminAlerts(admin, postId, "Hidden after a nudity report")).isEqualTo(1);

		post(admin, "/api/v1/admin/reports/POST/" + postId + "/restore", null).andExpect(status().isNoContent());
		report(aged(loginPro("NudityAgain")), postId, "Nudity or sexual content");
		get(stranger, "/api/v1/feed/" + postId).andExpect(status().isOk());

		String other = JsonPath.read(transformation(owner, uniquePhoto(owner), uniquePhoto(owner), "EVERYONE"), "$.feedItemId");
		report(aged(loginPro("SpamReporter")), other, "Spam");
		get(stranger, "/api/v1/feed/" + other).andExpect(status().isOk());
		report(aged(loginPro("LabelReporter")), other, "Nudity or sexual content");
		get(stranger, "/api/v1/feed/" + other).andExpect(status().isNotFound());
	}

	@Test
	void theFourthModeratorRemovalSuspendsTheAuthorAndTellsThem() throws Exception {
		Session admin = admin();
		Session owner = loginPro("StrikeOwner");
		pushToken(owner);
		for (int i = 1; i <= 4; i++) {
			String postId = JsonPath.read(transformation(owner, photoUrl(owner), photoUrl(owner), "FRIENDS"), "$.feedItemId");
			post(admin, "/api/v1/admin/reports/POST/" + postId + "/remove", null).andExpect(status().isNoContent());
			get(admin, "/api/v1/admin/users/" + owner.id()).andExpect(jsonPath("$.strikes").value(i))
					.andExpect(jsonPath("$.suspended").value(i == 4));
			assertThat(pushes.to(owner.id(), PushType.ACCOUNT_SUSPENDED)).hasSize(i == 4 ? 1 : 0);
		}
		get(owner, "/api/v1/me").andExpect(jsonPath("$.suspended").value(true));
		get(owner, "/api/v1/transformations").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SUSPENDED"));
	}
}
