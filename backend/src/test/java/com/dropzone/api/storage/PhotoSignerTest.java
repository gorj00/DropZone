package com.dropzone.api.storage;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class PhotoSignerTest {

	private static final String BASE = "https://storage.googleapis.com/bucket/";

	static class MovableClock extends Clock {

		Instant now;

		MovableClock(Instant now) {
			this.now = now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	static class SigningStorage implements StorageService {

		record Call(String objectName, Instant signedAt, Duration validFor) {
		}

		final List<Call> calls = new ArrayList<>();
		int attempts;
		boolean emulator;
		boolean failing;

		@Override
		public String upload(String objectName, byte[] data, String contentType) {
			return publicUrl(objectName);
		}

		@Override
		public byte[] read(String objectName) {
			throw new IllegalStateException("Not stored");
		}

		@Override
		public String publicUrl(String objectName) {
			return BASE + objectName;
		}

		@Override
		public String signedUrl(String objectName, Instant signedAt, Duration validFor) {
			attempts++;
			if (failing) {
				throw new IllegalStateException("IAM said no");
			}
			calls.add(new Call(objectName, signedAt, validFor));
			return emulator ? null : publicUrl(objectName) + "?X-Goog-Date=" + signedAt.getEpochSecond() + "&X-Goog-Expires="
					+ validFor.toSeconds() + "&X-Goog-Signature=" + calls.size();
		}

		@Override
		public void delete(String objectName) {
		}

		@Override
		public void deletePrefix(String prefix) {
		}

		@Override
		public List<StoredObject> list(String prefix) {
			return List.of();
		}
	}

	private final SigningStorage storage = new SigningStorage();
	private final MovableClock clock = new MovableClock(Instant.parse("2026-10-28T10:20:00Z"));
	private final PhotoSigner signer = new PhotoSigner(storage, new PhotoUrls(storage, null), clock);
	private final String photo = BASE + "uploads/" + UUID.randomUUID() + "/" + UUID.randomUUID() + ".jpg";

	@Test
	void signsOwnPhotosOncePerHourWithAnExpiryRoundedToTheHour() {
		String first = signer.sign(photo);
		clock.now = Instant.parse("2026-10-28T10:59:59Z");
		String later = signer.sign(photo);

		assertThat(first).startsWith(photo + "?").isEqualTo(later);
		assertThat(storage.calls).hasSize(1);
		SigningStorage.Call call = storage.calls.getFirst();
		assertThat(call.signedAt()).isEqualTo(Instant.parse("2026-10-28T10:00:00Z"));
		assertThat(call.signedAt().plus(call.validFor())).isEqualTo(Instant.parse("2026-10-28T23:00:00Z"));
		assertThat(call.validFor()).isGreaterThanOrEqualTo(PhotoSigner.LIFETIME);

		clock.now = Instant.parse("2026-10-28T11:00:00Z");
		String nextHour = signer.sign(photo);
		assertThat(nextHour).isNotEqualTo(first).startsWith(photo + "?");
		assertThat(storage.calls).hasSize(2);
		assertThat(storage.calls.get(1).signedAt()).isEqualTo(Instant.parse("2026-10-28T11:00:00Z"));
	}

	@Test
	void leavesForeignSignedAndUnsignableUrlsAlone() {
		String unsplash = "https://images.unsplash.com/photo-1?ixid=abc&w=1080";
		assertThat(signer.sign(unsplash)).isEqualTo(unsplash);
		assertThat(signer.sign("https://lh3.googleusercontent.com/a/face")).isEqualTo("https://lh3.googleusercontent.com/a/face");
		assertThat(signer.sign(null)).isNull();
		String signed = signer.sign(photo);
		assertThat(signer.sign(signed)).isEqualTo(signed);
		assertThat(signer.sign(BASE + "uploads/not-a-user/face.jpg")).isEqualTo(BASE + "uploads/not-a-user/face.jpg");
		assertThat(storage.calls).hasSize(1);

		String other = BASE + "uploads/" + UUID.randomUUID() + "/" + UUID.randomUUID() + ".png";
		storage.emulator = true;
		assertThat(signer.sign(other)).isEqualTo(other);
		storage.emulator = false;
		storage.failing = true;
		assertThat(signer.sign(other)).isEqualTo(other);
	}

	@Test
	void aFailingSignerServesPlainLinksAndWarnsOnlyEveryFewMinutes() {
		Logger logger = (Logger) LoggerFactory.getLogger(PhotoSigner.class);
		ListAppender<ILoggingEvent> logs = new ListAppender<>();
		logs.start();
		logger.addAppender(logs);
		try {
			storage.failing = true;
			String other = BASE + "uploads/" + UUID.randomUUID() + "/" + UUID.randomUUID() + ".png";
			for (int i = 0; i < 50; i++) {
				assertThat(signer.sign(photo)).isEqualTo(photo);
				assertThat(signer.sign(other)).isEqualTo(other);
			}
			assertThat(storage.attempts).isEqualTo(1);

			clock.now = clock.now.plus(PhotoSigner.PAUSE_AFTER_FAILURE);
			assertThat(signer.sign(photo)).isEqualTo(photo);
			assertThat(storage.attempts).isEqualTo(2);
			assertThat(warnings(logs)).hasSize(1);

			clock.now = clock.now.plus(PhotoSigner.WARN_EVERY);
			assertThat(signer.sign(other)).isEqualTo(other);
			assertThat(warnings(logs)).hasSize(2);

			storage.failing = false;
			clock.now = clock.now.plus(PhotoSigner.PAUSE_AFTER_FAILURE);
			assertThat(signer.sign(photo)).startsWith(photo + "?");
			assertThat(warnings(logs)).hasSize(2);
		}
		finally {
			logger.detachAppender(logs);
		}
	}

	private static List<ILoggingEvent> warnings(ListAppender<ILoggingEvent> logs) {
		return logs.list.stream().filter(e -> e.getLevel() == Level.WARN).toList();
	}

	@Test
	void inputAcceptsCanonicalOrSignedOwnUrls() {
		PhotoUrls urls = new PhotoUrls(storage, null);
		String signed = signer.sign(photo);
		assertThat(urls.canonical(signed)).isEqualTo(photo);
		assertThat(urls.canonical(" " + photo + " ")).isEqualTo(photo);
		assertThat(urls.canonical("https://images.unsplash.com/photo-1?w=1080")).isEqualTo("https://images.unsplash.com/photo-1?w=1080");
		assertThat(urls.canonical("https://evil.example/x.jpg?a=b")).isEqualTo("https://evil.example/x.jpg?a=b");
	}
}
