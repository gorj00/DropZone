package com.dropzone.api.storage;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.cloud.storage.Storage;
import java.security.KeyPairGenerator;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class GcsSigningTest {

	@Test
	void v4UrlsUseTheGivenSigningTimeSoTheyStayTheSameWithinTheHour() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
		generator.initialize(2048);
		ServiceAccountCredentials credentials = ServiceAccountCredentials.newBuilder()
				.setClientEmail("api@project.iam.gserviceaccount.com")
				.setPrivateKey(generator.generateKeyPair().getPrivate())
				.setProjectId("project")
				.build();
		Storage client = GcsStorageService.options().setProjectId("project").setCredentials(credentials).build().getService();
		Instant hour = Instant.parse("2026-10-28T10:00:00Z");
		Duration validFor = PhotoSigner.SIGNED_FOR;

		String first = GcsStorageService.sign(client, "bucket", "uploads/a/b.jpg", hour, validFor);
		String again = GcsStorageService.sign(client, "bucket", "uploads/a/b.jpg", hour, validFor);
		String next = GcsStorageService.sign(client, "bucket", "uploads/a/b.jpg", hour.plusSeconds(3600), validFor);

		assertThat(first).isEqualTo(again)
				.startsWith("https://storage.googleapis.com/bucket/uploads/a/b.jpg?")
				.contains("X-Goog-Algorithm=GOOG4-RSA-SHA256")
				.contains("X-Goog-Date=20261028T100000Z")
				.contains("X-Goog-Expires=46800")
				.contains("X-Goog-Signature=");
		assertThat(next).isNotEqualTo(first).contains("X-Goog-Date=20261028T110000Z");
	}
}
