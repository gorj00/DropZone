package com.dropzone.api;

import com.dropzone.api.auth.GoogleTokenVerifier;
import com.dropzone.api.billing.RevenueCatClient;
import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.PhotoCredit;
import com.dropzone.api.common.Dtos.PhotoDto;
import com.dropzone.api.jobs.JobTokenVerifier;
import com.dropzone.api.moderation.SafeSearch;
import com.dropzone.api.photo.PhotoClient;
import com.dropzone.api.push.PushSender;
import com.dropzone.api.push.PushType;
import com.dropzone.api.storage.StorageService;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
class TestFakes {

	@Bean
	@Primary
	InMemoryStorage inMemoryStorage() {
		return new InMemoryStorage();
	}

	@Bean
	@Primary
	FakePhotos fakePhotos() {
		return new FakePhotos();
	}

	@Bean
	@Primary
	FakeGoogle fakeGoogle() {
		return new FakeGoogle();
	}

	@Bean
	@Primary
	FakeRevenueCat fakeRevenueCat() {
		return new FakeRevenueCat();
	}

	@Bean
	@Primary
	FakePush fakePush() {
		return new FakePush();
	}

	@Bean
	@Primary
	FakeJobTokens fakeJobTokens() {
		return new FakeJobTokens();
	}

	@Bean
	@Primary
	FakeSafeSearch fakeSafeSearch() {
		return new FakeSafeSearch();
	}

	static class FakeSafeSearch implements SafeSearch {

		static final Verdict SAFE = new Verdict(Likelihood.VERY_UNLIKELY, Likelihood.VERY_UNLIKELY);

		private final Map<String, Verdict> verdicts = new ConcurrentHashMap<>();
		private final Set<String> failing = ConcurrentHashMap.newKeySet();
		final List<String> checked = new CopyOnWriteArrayList<>();

		void flag(byte[] image, Verdict verdict) {
			verdicts.put(digest(image), verdict);
		}

		void fail(byte[] image) {
			failing.add(digest(image));
		}

		boolean wasChecked(byte[] image) {
			return checked.contains(digest(image));
		}

		@Override
		public Verdict check(byte[] image) {
			String digest = digest(image);
			checked.add(digest);
			if (failing.contains(digest)) {
				throw new IllegalStateException("Vision is down");
			}
			return verdicts.getOrDefault(digest, SAFE);
		}

		static String digest(byte[] image) {
			try {
				return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(image));
			}
			catch (NoSuchAlgorithmException e) {
				throw new IllegalStateException(e);
			}
		}
	}

	static class FakeJobTokens implements JobTokenVerifier {

		private final Map<String, Claims> tokens = new ConcurrentHashMap<>();

		String token(String issuer, String audience, String email, boolean verified) {
			String token = "oidc-" + UUID.randomUUID();
			tokens.put(token, new Claims(issuer, List.of(audience), email, verified));
			return token;
		}

		@Override
		public Claims verify(String idToken, String audience) {
			Claims claims = tokens.get(idToken);
			if (claims == null) {
				throw ApiException.unauthorized("Invalid job token");
			}
			return claims;
		}
	}

	static class FakeRevenueCat implements RevenueCatClient {

		final Map<String, Entitlement> entitlements = new ConcurrentHashMap<>();
		final List<String> calls = new CopyOnWriteArrayList<>();

		void set(UUID userId, Entitlement entitlement) {
			entitlements.put(userId.toString(), entitlement);
		}

		void unavailable(UUID userId) {
			entitlements.remove(userId.toString());
		}

		long calls(UUID userId) {
			return calls.stream().filter(userId.toString()::equals).count();
		}

		@Override
		public Optional<Entitlement> entitlement(String appUserId, String entitlementId) {
			calls.add(appUserId);
			return Optional.ofNullable(entitlements.get(appUserId));
		}

		@Override
		public void deleteSubscriber(String appUserId) {
		}

		final List<String> cancelled = new CopyOnWriteArrayList<>();
		volatile boolean failCancel;

		@Override
		public boolean cancelPlaySubscription(String appUserId, String storeTransactionId) {
			if (failCancel) {
				return false;
			}
			cancelled.add(appUserId + ":" + storeTransactionId);
			return true;
		}
	}

	static class FakePush implements PushSender {

		record Sent(UUID userId, String token, PushType type, String title, Map<String, String> data) {
		}

		final List<Sent> sent = new CopyOnWriteArrayList<>();
		final Set<String> deadTokens = ConcurrentHashMap.newKeySet();
		final Set<UUID> failingUsers = ConcurrentHashMap.newKeySet();

		List<Sent> to(UUID userId) {
			return sent.stream().filter(s -> s.userId().equals(userId)).toList();
		}

		List<Sent> to(UUID userId, PushType type) {
			return sent.stream().filter(s -> s.userId().equals(userId) && s.type() == type).toList();
		}

		List<Sent> toToken(String token) {
			return sent.stream().filter(s -> s.token().equals(token)).toList();
		}

		@Override
		public Result send(UUID userId, String token, PushType type, String title, String body, Map<String, String> data) {
			if (failingUsers.contains(userId)) {
				throw new IllegalStateException("push failed for " + userId);
			}
			if (deadTokens.contains(token)) {
				return Result.DEAD_TOKEN;
			}
			sent.add(new Sent(userId, token, type, title, Map.copyOf(data)));
			return Result.SENT;
		}

		@Override
		public boolean ready() {
			return true;
		}
	}

	static class FakePhotos implements PhotoClient {

		final List<String> downloads = new CopyOnWriteArrayList<>();

		@Override
		public List<PhotoDto> search(String query) {
			return List.of(new PhotoDto("abc_1", "https://img.test/" + query + "-regular", "https://img.test/" + query + "-small",
					new PhotoCredit("Ann Lens", "https://unsplash.com/@ann")));
		}

		@Override
		public void trackDownload(String photoId) {
			downloads.add(photoId);
		}
	}

	static class FakeGoogle implements GoogleTokenVerifier {

		private final Map<String, GoogleIdentity> tokens = new ConcurrentHashMap<>();

		String token(String subject, String email, boolean verified, String name, String picture) {
			String token = "google-" + UUID.randomUUID();
			tokens.put(token, new GoogleIdentity(subject, email, verified, name, picture));
			return token;
		}

		@Override
		public GoogleIdentity verify(String idToken) {
			GoogleIdentity identity = tokens.get(idToken);
			if (identity == null) {
				throw ApiException.unauthorized("Invalid Google token");
			}
			return identity;
		}
	}

	static class InMemoryStorage implements StorageService {

		final Map<String, byte[]> objects = new ConcurrentHashMap<>();
		final Map<String, String> contentTypes = new ConcurrentHashMap<>();
		final Map<String, Instant> created = new ConcurrentHashMap<>();

		@Override
		public String upload(String objectName, byte[] data, String contentType) {
			objects.put(objectName, data);
			contentTypes.put(objectName, contentType);
			created.put(objectName, Instant.now());
			return publicUrl(objectName);
		}

		@Override
		public byte[] read(String objectName) {
			byte[] data = objects.get(objectName);
			if (data == null) {
				throw new IllegalStateException("No such object: " + objectName);
			}
			return data;
		}

		@Override
		public String publicUrl(String objectName) {
			return "https://storage.test/dropzone/" + objectName;
		}

		@Override
		public String signedUrl(String objectName, Instant signedAt, Duration validFor) {
			return signed(publicUrl(objectName));
		}

		static String signed(String url) {
			return url + SIGNATURE;
		}

		static final String SIGNATURE = "?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=46800&X-Goog-Signature=test";

		@Override
		public void delete(String objectName) {
			objects.remove(objectName);
			contentTypes.remove(objectName);
			created.remove(objectName);
		}

		@Override
		public void deletePrefix(String prefix) {
			objects.keySet().stream().filter(name -> name.startsWith(prefix)).toList().forEach(this::delete);
		}

		@Override
		public List<StoredObject> list(String prefix) {
			return objects.keySet().stream().filter(name -> name.startsWith(prefix))
					.map(name -> new StoredObject(name, created.get(name))).toList();
		}

		boolean hasPrefix(String prefix) {
			return objects.keySet().stream().anyMatch(name -> name.startsWith(prefix));
		}
	}
}
