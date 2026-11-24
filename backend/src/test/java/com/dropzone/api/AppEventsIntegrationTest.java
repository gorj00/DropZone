package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class AppEventsIntegrationTest extends IntegrationTest {

	@Test
	void eventsAreAcceptedWithoutSignInAndValidated() throws Exception {
		String ip = randomIp();
		UUID device = UUID.randomUUID();
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"APP_OPEN\",\"appVersion\":\"1.4 (10)\"}".formatted(device))
				.andExpect(status().isNoContent());
		event(ip, "not-a-valid-token", "ios", "{\"deviceId\":\"%s\",\"name\":\"WELCOME_VIEW\"}".formatted(device))
				.andExpect(status().isNoContent());
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"NOPE\"}".formatted(device)).andExpect(status().isBadRequest());
		event(ip, null, null, "{\"name\":\"APP_OPEN\"}").andExpect(status().isBadRequest());
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"ONBOARDING_STEP\"}".formatted(device)).andExpect(status().isBadRequest());
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"ONBOARDING_STEP\",\"detail\":\"Drop table\"}".formatted(device))
				.andExpect(status().isBadRequest());
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"SIGN_IN_FAIL\",\"detail\":\"%s\"}".formatted(device, "x".repeat(301)))
				.andExpect(status().isBadRequest());

		List<Map<String, Object>> rows = jdbc.queryForList("select name, platform, app_version from app_events where device_id = ? order by at",
				device);
		assertThat(rows).extracting(r -> r.get("name")).containsExactly("APP_OPEN", "WELCOME_VIEW");
		assertThat(rows).extracting(r -> r.get("platform")).containsExactly("ANDROID", "IOS");
		assertThat(rows.getFirst().get("app_version")).isEqualTo("1.4 (10)");
	}

	@Test
	void backofficeShowsTheFunnelAndRecentEvents() throws Exception {
		Session admin = admin();
		long opensBefore = devices(admin, "APP_OPEN", null);
		long profileBefore = devices(admin, "ONBOARDING_STEP", "profile");
		String ip = randomIp();
		UUID first = UUID.randomUUID();
		UUID second = UUID.randomUUID();
		for (UUID device : List.of(first, first, second)) {
			event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"APP_OPEN\"}".formatted(device)).andExpect(status().isNoContent());
		}
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"ONBOARDING_STEP\",\"detail\":\"profile\"}".formatted(second))
				.andExpect(status().isNoContent());
		event(ip, null, null, "{\"deviceId\":\"%s\",\"name\":\"SIGN_IN_FAIL\",\"detail\":\"google UNAUTHORIZED: Invalid Google token\"}"
				.formatted(first)).andExpect(status().isNoContent());

		assertThat(devices(admin, "APP_OPEN", null)).isEqualTo(opensBefore + 2);
		assertThat(devices(admin, "ONBOARDING_STEP", "profile")).isEqualTo(profileBefore + 1);
		get(admin, "/api/v1/admin/funnel?days=500").andExpect(status().isOk()).andExpect(jsonPath("$.days").value(90));
		get(admin, "/api/v1/admin/events?name=SIGN_IN_FAIL&limit=1").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].deviceId").value(first.toString()))
				.andExpect(jsonPath("$[0].detail").value("google UNAUTHORIZED: Invalid Google token"))
				.andExpect(jsonPath("$[0].platform").value("ANDROID"));
		get(admin, "/api/v1/admin/events?limit=2").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].name").value("SIGN_IN_FAIL"))
				.andExpect(jsonPath("$[1].name").value("ONBOARDING_STEP"));

		Session plain = login("Plain");
		get(plain, "/api/v1/admin/funnel").andExpect(status().isForbidden());
		get(plain, "/api/v1/admin/events").andExpect(status().isForbidden());
	}

	private long devices(Session admin, String name, String step) throws Exception {
		String body = body(get(admin, "/api/v1/admin/funnel?days=1").andExpect(status().isOk()));
		String filter = step == null ? "$.counts[?(@.name=='%s')].devices".formatted(name)
				: "$.counts[?(@.name=='%s' && @.step=='%s')].devices".formatted(name, step);
		List<Number> found = JsonPath.read(body, filter);
		return found.isEmpty() ? 0 : found.getFirst().longValue();
	}

	private ResultActions event(String ip, String token, String platform, String json) throws Exception {
		var builder = request(HttpMethod.POST, "/api/v1/events").header("X-Forwarded-For", ip).contentType(MediaType.APPLICATION_JSON).content(json);
		if (token != null) {
			builder.header("Authorization", "Bearer " + token);
		}
		if (platform != null) {
			builder.header("X-Platform", platform);
		}
		return mvc.perform(builder);
	}
}
