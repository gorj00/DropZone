package com.dropzone.api.config;

import com.dropzone.api.push.PushSender;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.EnvironmentAware;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@Profile("prod")
public class ProductionGuard {

	static final String DEV_JWT_SECRET = "local-dev-secret-change-me-0123456789abcdef";
	static final String DEV_WEBHOOK_SECRET = "dev-webhook-secret";
	static final Set<String> APP_ORIGINS = Set.of("https://localhost", "capacitor://localhost");
	static final String SIGNED_HOST = "https://storage.googleapis.com/";

	@Bean
	static SettingsCheck productionSettingsCheck() {
		return new SettingsCheck();
	}

	@Bean
	InitializingBean productionPushCheck(PushSender push) {
		return () -> {
			if (!push.ready()) {
				fail(List.of("Firebase messaging could not be initialised"));
			}
		};
	}

	public static List<String> problems(AppProperties props, String dbUrl, boolean pushReady) {
		List<String> problems = new ArrayList<>();
		if (props.auth().devLogin()) {
			problems.add("DEV_LOGIN must be false");
		}
		String jwtSecret = props.auth().jwtSecret();
		if (blank(jwtSecret) || DEV_JWT_SECRET.equals(jwtSecret.trim())) {
			problems.add("JWT_SECRET must be set to a non-dev value");
		}
		String webhookSecret = props.billing().revenuecatWebhookSecret();
		if (blank(webhookSecret) || DEV_WEBHOOK_SECRET.equals(webhookSecret.trim())) {
			problems.add("REVENUECAT_WEBHOOK_SECRET must be set to a non-dev value");
		}
		AppProperties.Storage storage = props.storage();
		if (!blank(storage.endpoint())) {
			problems.add("GCS_ENDPOINT must be empty");
		}
		if (blank(storage.bucket())) {
			problems.add("GCS_BUCKET must be set");
		}
		if (blank(storage.publicBaseUrl()) || localhost(storage.publicBaseUrl())) {
			problems.add("GCS_PUBLIC_BASE_URL must be set and must not point to localhost");
		}
		else if (!blank(storage.bucket()) && !storage.publicBaseUrl().trim().replaceAll("/+$", "").equals(SIGNED_HOST + storage.bucket().trim())) {
			problems.add("GCS_PUBLIC_BASE_URL must be " + SIGNED_HOST + "<GCS_BUCKET> (signed photo links are served from there)");
		}
		if (localhost(dbUrl)) {
			problems.add("DB_URL must not point to localhost");
		}
		List<String> origins = props.cors().allowedOrigins() == null ? List.of() : props.cors().allowedOrigins();
		for (String origin : origins) {
			if (localhost(origin) && !APP_ORIGINS.contains(origin.trim())) {
				problems.add("CORS_ORIGINS must not contain " + origin.trim());
			}
		}
		AppProperties.Jobs jobs = props.jobs();
		if (jobs == null || blank(jobs.audience())) {
			problems.add("JOBS_AUDIENCE must be set");
		}
		if (jobs == null || blank(jobs.invoker())) {
			problems.add("JOBS_INVOKER must be set");
		}
		if (blank(props.push().firebaseCredentials())) {
			problems.add("FIREBASE_CREDENTIALS must be set");
		}
		else if (!pushReady) {
			problems.add("Firebase messaging could not be initialised");
		}
		return problems;
	}

	static void fail(List<String> problems) {
		if (!problems.isEmpty()) {
			throw new IllegalStateException("Refusing to start with the prod profile: " + String.join("; ", problems));
		}
	}

	private static boolean localhost(String value) {
		return value != null && (value.contains("localhost") || value.contains("127.0.0.1"));
	}

	private static boolean blank(String value) {
		return value == null || value.isBlank();
	}

	static final class SettingsCheck implements BeanFactoryPostProcessor, EnvironmentAware {

		private Environment environment;

		@Override
		public void setEnvironment(Environment environment) {
			this.environment = environment;
		}

		@Override
		public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
			AppProperties props = Binder.get(environment).bind("dropzone", AppProperties.class)
					.orElseThrow(() -> new IllegalStateException("Missing dropzone settings"));
			fail(problems(props, environment.getProperty("spring.datasource.url", ""), true));
		}
	}
}
