package com.dropzone.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.stream.Collectors;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import javax.imageio.ImageIO;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, TestFakes.class })
@TestPropertySource(properties = { "dropzone.auth.jwt-secret=" + IntegrationTest.JWT_SECRET, "dropzone.storage.create-bucket=false",
		"dropzone.billing.revenuecat-webhook-secret=test-secret", "dropzone.billing.revenuecat-api-key=",
		"dropzone.push.firebase-credentials=", "dropzone.admin-emails=moderator@test.dev",
		"dropzone.jobs.audience=" + IntegrationTest.JOBS_AUDIENCE, "dropzone.jobs.invoker=" + IntegrationTest.JOBS_INVOKER,
		"dropzone.jobs.status-token=" + IntegrationTest.STATUS_TOKEN })
public abstract class IntegrationTest {

	protected static final String JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789";
	protected static final String JOBS_AUDIENCE = "https://api.test/internal/jobs";
	protected static final String JOBS_INVOKER = "scheduler@jobs.test";
	protected static final String STATUS_TOKEN = "test-status-token";
	private static final SecureRandom RANDOM = new SecureRandom();

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	protected TestFakes.FakeGoogle google;

	@Autowired
	protected TestFakes.InMemoryStorage storage;

	@Autowired
	protected TestFakes.FakeRevenueCat revenueCat;

	@Autowired
	protected TestFakes.FakePush pushes;

	@Autowired
	protected TestFakes.FakeJobTokens jobTokens;

	@Autowired
	protected TestFakes.FakeSafeSearch safeSearch;

	protected record Session(String token, UUID id, String handle, String inviteCode) {
	}

	protected Session login(String name) throws Exception {
		Session session = loginTrial(name);
		endTrial(session);
		return session;
	}

	protected Session loginTrial(String name) throws Exception {
		Session session = signUp(name);
		jdbc.update("update users set trial_ends_at = now() + interval '7 days' where id = ?", session.id());
		return session;
	}

	protected Session signUp(String name) throws Exception {
		String email = name.toLowerCase() + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.dev";
		return googleLogin("sub-" + UUID.randomUUID(), email, name);
	}

	protected Session googleLogin(String subject, String email, String name) throws Exception {
		String body = body(googleAuth(google.token(subject, email, true, name, null)).andExpect(status().isOk()));
		return new Session(JsonPath.read(body, "$.token"), UUID.fromString(JsonPath.read(body, "$.user.id")),
				JsonPath.read(body, "$.user.handle"), JsonPath.read(body, "$.user.inviteCode"));
	}

	protected ResultActions googleAuth(String idToken) throws Exception {
		return googleAuth(idToken, "10.%d.%d.%d".formatted(RANDOM.nextInt(256), RANDOM.nextInt(256), 1 + RANDOM.nextInt(254)));
	}

	protected ResultActions googleAuth(String idToken, String clientIp) throws Exception {
		return mvc.perform(request(HttpMethod.POST, "/api/v1/auth/google").header("X-Forwarded-For", clientIp)
				.contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"%s\"}".formatted(idToken)));
	}

	protected ResultActions job(String name, String token) throws Exception {
		var builder = request(HttpMethod.POST, "/internal/jobs/" + name);
		if (token != null) {
			builder.header("Authorization", "Bearer " + token);
		}
		return mvc.perform(builder);
	}

	protected String runJob(String name) throws Exception {
		return body(job(name, jobTokens.token("https://accounts.google.com", JOBS_AUDIENCE, JOBS_INVOKER, true)).andExpect(status().isOk()));
	}

	protected Session loginPro(String name) throws Exception {
		Session session = login(name);
		makePro(session);
		return session;
	}

	protected void endTrial(Session session) {
		jdbc.update("update users set trial_ends_at = now() - interval '1 minute' where id = ?", session.id());
	}

	protected void makePro(Session session) {
		jdbc.update("update users set pro = true, pro_expires_at = null where id = ?", session.id());
	}

	protected Session aged(Session session) {
		jdbc.update("update users set created_at = now() - interval '4 days' where id = ?", session.id());
		return session;
	}

	protected void addFriends(Session session, int count) throws Exception {
		for (int i = 0; i < count; i++) {
			befriend(session, signUp("Pal" + i));
		}
	}

	protected void joinByInvite(Session visitor, Session owner) throws Exception {
		post(visitor, "/api/v1/social/invite/" + owner.inviteCode() + "/accept", null).andExpect(status().isOk());
		String requests = body(get(owner, "/api/v1/social/requests").andExpect(status().isOk()));
		List<String> ids = JsonPath.read(requests, "$.incoming[?(@.from.id=='" + visitor.id() + "')].id");
		if (!ids.isEmpty()) {
			post(owner, "/api/v1/social/requests/" + ids.getFirst() + "/accept", null).andExpect(status().isOk());
		}
	}

	protected void befriend(Session a, Session b) {
		jdbc.update("insert into friendships (user_id, friend_id) values (?, ?), (?, ?)", a.id(), b.id(), b.id(), a.id());
	}

	protected String userQuestId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}

	protected Session admin() throws Exception {
		return googleLogin("moderator-sub", "moderator@test.dev", "Mod");
	}

	protected static String forgeToken(String secret, String issuer, List<String> audience, UUID subject, Integer version,
			Instant issuedAt, Instant expiresAt) {
		SecretKey key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		JwtEncoder encoder = new NimbusJwtEncoder(new ImmutableSecret<SecurityContext>(key));
		JwtClaimsSet.Builder claims = JwtClaimsSet.builder().issuer(issuer).subject(subject.toString()).issuedAt(issuedAt)
				.expiresAt(expiresAt);
		if (audience != null) {
			claims.audience(audience);
		}
		if (version != null) {
			claims.claim("ver", version);
		}
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
	}

	protected static Session withToken(Session session, String token) {
		return new Session(token, session.id(), session.handle(), session.inviteCode());
	}

	protected String photoUrl(Session session) {
		return storage.publicUrl("uploads/" + session.id() + "/" + UUID.randomUUID() + ".jpg");
	}

	protected static String signed(String canonicalUrl) {
		return TestFakes.InMemoryStorage.signed(canonicalUrl);
	}

	protected static String canonical(String url) {
		int query = url.indexOf('?');
		return query < 0 ? url : url.substring(0, query);
	}

	protected String objectName(String url) {
		return canonical(url).substring(storage.publicUrl("").length());
	}

	protected String uploadPhoto(Session session) throws Exception {
		String body = body(upload(session, new MockMultipartFile("file", "proof.png", "image/png", png(8, 6)))
				.andExpect(status().isOk()));
		return JsonPath.read(body, "$.url");
	}

	protected ResultActions upload(Session session, MockMultipartFile file) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.multipart("/api/v1/uploads").file(file)
				.header("Authorization", "Bearer " + session.token()));
	}

	protected static byte[] png(int width, int height) throws IOException {
		return encode(image(width, height), "png");
	}

	protected static byte[] jpeg(int width, int height) throws IOException {
		return encode(image(width, height), "jpg");
	}

	private static BufferedImage image(int width, int height) {
		BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = image.createGraphics();
		g.setColor(Color.ORANGE);
		g.fillRect(0, 0, width, height);
		g.dispose();
		return image;
	}

	private static byte[] encode(BufferedImage image, String format) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(image, format, out);
		return out.toByteArray();
	}

	protected ResultActions call(HttpMethod method, Session session, String url, String json) throws Exception {
		var builder = request(method, url);
		if (session != null) {
			builder.header("Authorization", "Bearer " + session.token());
		}
		if (json != null) {
			builder.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return mvc.perform(builder);
	}

	protected ResultActions get(Session session, String url) throws Exception {
		return call(HttpMethod.GET, session, url, null);
	}

	protected ResultActions post(Session session, String url, String json) throws Exception {
		return call(HttpMethod.POST, session, url, json);
	}

	protected ResultActions put(Session session, String url, String json) throws Exception {
		return call(HttpMethod.PUT, session, url, json);
	}

	protected ResultActions patch(Session session, String url, String json) throws Exception {
		return call(HttpMethod.PATCH, session, url, json);
	}

	protected ResultActions delete(Session session, String url) throws Exception {
		return call(HttpMethod.DELETE, session, url, null);
	}

	protected static String body(ResultActions result) throws Exception {
		return result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	@FunctionalInterface
	protected interface Call {
		ResultActions run(int index) throws Exception;
	}

	protected static List<Integer> parallel(int count, Call call) {
		CountDownLatch start = new CountDownLatch(1);
		List<CompletableFuture<Integer>> calls = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			int index = i;
			calls.add(CompletableFuture.supplyAsync(() -> {
				try {
					start.await();
					return call.run(index).andReturn().getResponse().getStatus();
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			}));
		}
		start.countDown();
		return calls.stream().map(CompletableFuture::join).sorted().toList();
	}

	protected String onboardLose(Session session, int checkpoints, String... codes) throws Exception {
		String quests = String.join("\",\"", codes);
		return body(post(session, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":%d,
				 "questCodes":["%s"],"lockedApps":["com.instagram.android"],"unlockMode":"WHOLE_DAY","questSettings":%s}
				""".formatted(checkpoints, quests, daily(codes))).andExpect(status().isOk()));
	}

	protected static String daily(String... codes) {
		return Arrays.stream(codes).map("{\"code\":\"%s\",\"days\":[1,2,3,4,5,6,7],\"perDay\":1}"::formatted)
				.collect(Collectors.joining(",", "[", "]"));
	}
}
