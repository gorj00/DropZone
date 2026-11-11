package com.dropzone.api.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("dropzone")
public record AppProperties(Auth auth, Storage storage, Push push, Billing billing, Photos photos, Cors cors, Legal legal, App app,
		Jobs jobs, String inviteBaseUrl, List<String> adminEmails) {

	public record Auth(String jwtSecret, int jwtTtlDays, List<String> googleClientIds, List<String> appleClientIds, String appleTeamId,
			String appleKeyId, String applePrivateKey, boolean devLogin) {
	}

	public record Storage(String bucket, String endpoint, String publicBaseUrl, boolean createBucket, String projectId) {
	}

	public record Push(String firebaseCredentials) {
	}

	public record Billing(String revenuecatWebhookSecret, String revenuecatApiKey, String entitlement) {
	}

	public record Photos(String unsplashAccessKey) {
	}

	public record Cors(List<String> allowedOrigins) {
	}

	public record Legal(String termsVersion, String privacyVersion, String termsUrl, String privacyUrl, String deleteAccountUrl) {
	}

	public record App(int minVersionCode) {
	}

	public record Jobs(boolean inProcess, String audience, String invoker, String statusToken) {
	}
}
