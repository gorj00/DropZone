package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dropzone.api.push.PushSender;
import com.dropzone.api.push.PushType;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.env.MockEnvironment;

class ProductionGuardTest {

	private static final String CLOUD_SQL = "jdbc:postgresql:///dropzone?cloudSqlInstance=p:r:i&socketFactory=com.google.cloud.sql.postgres.SocketFactory";

	private static final AppProperties.Jobs JOBS = new AppProperties.Jobs(false, "https://api.example.com/internal/jobs",
			"scheduler@project.iam.gserviceaccount.com");

	private static AppProperties props(boolean devLogin, String jwt, String webhook, String endpoint, String publicUrl, List<String> cors,
			String firebase) {
		return props(devLogin, jwt, webhook, endpoint, publicUrl, cors, firebase, JOBS);
	}

	private static AppProperties props(boolean devLogin, String jwt, String webhook, String endpoint, String publicUrl, List<String> cors,
			String firebase, AppProperties.Jobs jobs) {
		return new AppProperties(new AppProperties.Auth(jwt, 7, List.of("client"), devLogin),
				new AppProperties.Storage("bucket", endpoint, publicUrl, false, "project"), new AppProperties.Push(firebase),
				new AppProperties.Billing(webhook, "", "pro"), new AppProperties.Photos(""), new AppProperties.Cors(cors),
				new AppProperties.Legal("1", "1", "", "", ""), new AppProperties.App(1), jobs, "https://x/invite/", List.of());
	}

	private static AppProperties good() {
		return props(false, "a-real-secret-0123456789abcdef0123456789", "real-webhook-secret", "",
				"https://storage.googleapis.com/bucket", List.of("https://localhost"), "adc");
	}

	@Test
	void productionValuesPass() {
		assertThat(ProductionGuard.problems(good(), CLOUD_SQL, true)).isEmpty();
	}

	@Test
	void devDefaultsAreRefused() {
		AppProperties dev = props(true, ProductionGuard.DEV_JWT_SECRET, ProductionGuard.DEV_WEBHOOK_SECRET, "http://localhost:4443",
				"http://localhost:4443/dropzone-local", List.of("http://localhost:4200", "https://localhost"), "");
		List<String> problems = ProductionGuard.problems(dev, "jdbc:postgresql://localhost:5432/dropzone", false);
		assertThat(problems).containsExactly("DEV_LOGIN must be false", "JWT_SECRET must be set to a non-dev value",
				"REVENUECAT_WEBHOOK_SECRET must be set to a non-dev value", "GCS_ENDPOINT must be empty",
				"GCS_PUBLIC_BASE_URL must be set and must not point to localhost", "DB_URL must not point to localhost",
				"CORS_ORIGINS must not contain http://localhost:4200", "FIREBASE_CREDENTIALS must be set");
	}

	@Test
	void jobEndpointsMustBeLockedToTheScheduler() {
		AppProperties open = props(false, "a-real-secret-0123456789abcdef0123456789", "real-webhook-secret", "",
				"https://storage.googleapis.com/bucket", List.of("https://localhost"), "adc", new AppProperties.Jobs(false, " ", null));
		assertThat(ProductionGuard.problems(open, CLOUD_SQL, true)).containsExactly("JOBS_AUDIENCE must be set", "JOBS_INVOKER must be set");
	}

	@Test
	void photoLinksMustComeFromTheBucketItSigns() {
		AppProperties cdn = props(false, "a-real-secret-0123456789abcdef0123456789", "real-webhook-secret", "",
				"https://photos.example.com/bucket", List.of("https://localhost"), "adc");
		assertThat(ProductionGuard.problems(cdn, CLOUD_SQL, true))
				.containsExactly("GCS_PUBLIC_BASE_URL must be https://storage.googleapis.com/<GCS_BUCKET> (signed photo links are served from there)");
		AppProperties slash = props(false, "a-real-secret-0123456789abcdef0123456789", "real-webhook-secret", "",
				"https://storage.googleapis.com/bucket/", List.of("https://localhost"), "adc");
		assertThat(ProductionGuard.problems(slash, CLOUD_SQL, true)).isEmpty();
	}

	@Test
	void blankSecretsAndBrokenPushAreRefused() {
		AppProperties blank = props(false, "", " ", "", "https://storage.googleapis.com/bucket", List.of("https://localhost"), "adc");
		assertThat(ProductionGuard.problems(blank, CLOUD_SQL, false)).containsExactly("JWT_SECRET must be set to a non-dev value",
				"REVENUECAT_WEBHOOK_SECRET must be set to a non-dev value", "Firebase messaging could not be initialised");
	}

	@Test
	void settingsCheckFailsStartupBeforeAnyBeanIsCreated() {
		MockEnvironment env = new MockEnvironment().withProperty("dropzone.auth.dev-login", "true")
				.withProperty("dropzone.auth.jwt-ttl-days", "7")
				.withProperty("dropzone.storage.bucket", "bucket")
				.withProperty("dropzone.storage.public-base-url", "https://storage.googleapis.com/bucket")
				.withProperty("dropzone.push.firebase-credentials", "adc")
				.withProperty("dropzone.jobs.audience", JOBS.audience())
				.withProperty("dropzone.jobs.invoker", JOBS.invoker())
				.withProperty("dropzone.cors.allowed-origins", "https://localhost")
				.withProperty("dropzone.billing.revenuecat-webhook-secret", "real-webhook-secret")
				.withProperty("dropzone.auth.jwt-secret", "a-real-secret-0123456789abcdef0123456789")
				.withProperty("spring.datasource.url", CLOUD_SQL);
		ProductionGuard.SettingsCheck check = new ProductionGuard.SettingsCheck();
		check.setEnvironment(env);
		assertThatThrownBy(() -> check.postProcessBeanFactory(new DefaultListableBeanFactory()))
				.isInstanceOf(IllegalStateException.class).hasMessage("Refusing to start with the prod profile: DEV_LOGIN must be false");
	}

	@Test
	void pushCheckFailsWhenFirebaseIsDown() {
		PushSender down = new PushSender() {
			@Override
			public Result send(UUID userId, String token, PushType type, String title, String body, Map<String, String> data) {
				return Result.FAILED;
			}

			@Override
			public boolean ready() {
				return false;
			}
		};
		assertThatThrownBy(() -> new ProductionGuard().productionPushCheck(down).afterPropertiesSet())
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("Firebase messaging could not be initialised");
	}
}
