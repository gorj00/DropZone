package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.common.ServerErrorLog;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class AdminIntegrationTest extends IntegrationTest {

	@Autowired
	private ServerErrorLog errorLog;

	@Test
	void backofficeSignInIsOnlyForAdminEmails() throws Exception {
		long before = userCount();
		adminAuth(google.token("sub-" + UUID.randomUUID(), "stranger-" + UUID.randomUUID() + "@test.dev", true, "Stranger", null))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("FORBIDDEN"))
				.andExpect(jsonPath("$.token").doesNotExist());
		adminAuth(google.token("moderator-sub", "moderator@test.dev", false, "Mod", null)).andExpect(status().isForbidden());
		adminAuth("not-a-google-token").andExpect(status().isUnauthorized());
		assertThat(userCount()).isEqualTo(before);

		String body = body(adminAuth(google.token("moderator-sub", "moderator@test.dev", true, "Mod", null)).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.admin").value(true))
				.andExpect(jsonPath("$.user.email").value("moderator@test.dev")));
		Session admin = new Session(JsonPath.read(body, "$.token"), UUID.fromString(JsonPath.read(body, "$.user.id")), null, null);
		get(admin, "/api/v1/admin/overview").andExpect(status().isOk())
				.andExpect(jsonPath("$.totals.users").isNumber())
				.andExpect(jsonPath("$.signups.length()").value(30))
				.andExpect(jsonPath("$.jobs.length()").value(7))
				.andExpect(jsonPath("$.health.poolMax").isNumber())
				.andExpect(jsonPath("$.health.startedAt").isString());

		Session plain = login("Plain");
		for (String path : List.of("/api/v1/admin/overview", "/api/v1/admin/jobs", "/api/v1/admin/users", "/api/v1/admin/errors",
				"/api/v1/admin/billing-events", "/api/v1/admin/users/" + plain.id() + "/account", "/api/v1/admin/users/" + plain.id() + "/days")) {
			get(plain, path).andExpect(status().isForbidden());
			mvc.perform(MockMvcRequestBuilders.get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void overviewFlagsFailedJobsAndCountsSignups() throws Exception {
		Session admin = admin();
		jdbc.update("""
				insert into job_runs (name, last_run_at, failed_at, error) values ('upload-sweep', now(), now(), 'IllegalStateException: disk')
				on conflict (name) do update set failed_at = excluded.failed_at, error = excluded.error
				""");
		String body = body(get(admin, "/api/v1/admin/overview").andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(body, "$.jobs[?(@.name=='upload-sweep')].error")).containsExactly("IllegalStateException: disk");
		assertThat((int) JsonPath.read(body, "$.failedJobs")).isGreaterThanOrEqualTo(1);
		assertThat((String) JsonPath.read(body, "$.signups[29].day")).isEqualTo(LocalDate.now(ZoneOffset.UTC).toString());
		assertThat((int) JsonPath.read(body, "$.signups[29].count")).isGreaterThanOrEqualTo(1);

		runJob("upload-sweep");
		body = body(get(admin, "/api/v1/admin/jobs").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(7)));
		assertThat((List<Object>) JsonPath.read(body, "$[?(@.name=='upload-sweep')].failedAt")).containsExactly((Object) null);
	}

	@Test
	void usersCanBeSearchedAndInspected() throws Exception {
		Session admin = admin();
		Session zed = loginPro("Zed");
		post(zed, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90,"goalValue":80,"checkpoints":3,
				 "questCodes":["WEIGH_IN","STEPS"],"lockedApps":[],"unlockMode":"WHOLE_DAY"}
				""").andExpect(status().isOk());
		post(zed, "/api/v1/weigh-ins", "{\"date\":\"" + LocalDate.now(ZoneOffset.UTC) + "\",\"value\":89.5}").andExpect(status().isOk());
		post(zed, "/api/v1/quests/" + userQuestId(zed, "STEPS") + "/complete", "{\"value\":9000}").andExpect(status().isOk());

		get(admin, "/api/v1/admin/users?q=" + zed.handle()).andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.items[0].id").value(zed.id().toString()))
				.andExpect(jsonPath("$.items[0].onboarded").value(true))
				.andExpect(jsonPath("$.items[0].admin").value(false));
		get(admin, "/api/v1/admin/users?q=&size=500").andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(org.hamcrest.Matchers.lessThanOrEqualTo(200)));

		get(admin, "/api/v1/admin/users/" + zed.id() + "/account").andExpect(status().isOk())
				.andExpect(jsonPath("$.user.id").value(zed.id().toString()))
				.andExpect(jsonPath("$.goals.length()").value(1))
				.andExpect(jsonPath("$.goals[0].checkpoints.length()").value(3))
				.andExpect(jsonPath("$.quests[?(@.code=='WEIGH_IN')].active").value(true))
				.andExpect(jsonPath("$.counts.days").isNumber())
				.andExpect(jsonPath("$.reports.length()").value(0));

		get(admin, "/api/v1/admin/users/" + zed.id() + "/days").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].day").value(LocalDate.now(ZoneOffset.UTC).toString()))
				.andExpect(jsonPath("$[0].weight").value(89.5))
				.andExpect(jsonPath("$[0].completions[0].questName").isString())
				.andExpect(jsonPath("$[0].completions[0].value").value(9000.0))
				.andExpect(jsonPath("$[0].completions[0].status").value("DONE"));
		get(admin, "/api/v1/admin/users/" + zed.id() + "/days?from=2026-02-01&to=2026-01-01").andExpect(status().isBadRequest());
		get(admin, "/api/v1/admin/users/" + UUID.randomUUID() + "/account").andExpect(status().isNotFound());
	}

	@Test
	void errorsAndBillingEventsAreListed() throws Exception {
		Session admin = admin();
		errorLog.record("GET", "/api/v1/boom", new IllegalStateException("boom"), admin.id().toString());
		get(admin, "/api/v1/admin/errors?limit=5").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].exception").value("IllegalStateException"))
				.andExpect(jsonPath("$[0].message").value("boom"))
				.andExpect(jsonPath("$[0].path").value("/api/v1/boom"))
				.andExpect(jsonPath("$[0].email").value("moderator@test.dev"));

		String eventId = "evt-" + UUID.randomUUID();
		String liveId = "evt-" + UUID.randomUUID();
		jdbc.update("insert into billing_events (id, type, app_user_id, environment, received_at) values (?, 'RENEWAL', ?, 'SANDBOX', now())",
				eventId, admin.id().toString());
		jdbc.update("insert into billing_events (id, type, app_user_id, environment, received_at) values (?, 'CANCELLATION', ?, 'PRODUCTION', now() - interval '1 minute')",
				liveId, admin.id().toString());
		get(admin, "/api/v1/admin/billing-events?limit=5").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(eventId))
				.andExpect(jsonPath("$[0].type").value("RENEWAL"))
				.andExpect(jsonPath("$[0].email").value("moderator@test.dev"))
				.andExpect(jsonPath("$[1].id").value(liveId));
		get(admin, "/api/v1/admin/billing-events?limit=5&sandbox=false").andExpect(status().isOk())
				.andExpect(jsonPath("$[0].id").value(liveId))
				.andExpect(jsonPath("$[?(@.environment=='SANDBOX')]").isEmpty());
		get(admin, "/api/v1/admin/overview?sandbox=false").andExpect(status().isOk())
				.andExpect(jsonPath("$.billingEvents[?(@.environment=='SANDBOX')]").isEmpty());
	}

	private long userCount() {
		Long count = jdbc.queryForObject("select count(*) from users", Long.class);
		return count == null ? 0 : count;
	}

	private ResultActions adminAuth(String idToken) throws Exception {
		return mvc.perform(request(HttpMethod.POST, "/api/v1/auth/admin").header("X-Forwarded-For", "10.9." + (int) (Math.random() * 250) + "." + (1 + (int) (Math.random() * 250)))
				.contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"%s\"}".formatted(idToken)));
	}
}
