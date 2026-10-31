package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class StatusIntegrationTest extends IntegrationTest {

	@Test
	void statusNeedsTheTokenAndListsFailedJobs() throws Exception {
		mvc.perform(MockMvcRequestBuilders.get("/internal/status")).andExpect(status().isUnauthorized());
		mvc.perform(MockMvcRequestBuilders.get("/internal/status").header("Authorization", "Bearer wrong")).andExpect(status().isUnauthorized());

		runJob("notification-retention");
		assertThat(jdbc.queryForObject("select count(*) from job_runs where name = 'notification-retention' and failed_at is null", Integer.class))
				.isOne();
		jdbc.update("""
				insert into job_runs (name, last_run_at, failed_at, error) values ('daily-reminders', now(), now(), 'IllegalStateException: boom')
				on conflict (name) do update set failed_at = excluded.failed_at, error = excluded.error
				""");

		mvc.perform(MockMvcRequestBuilders.get("/internal/status").header("Authorization", "Bearer " + STATUS_TOKEN)).andExpect(status().isOk())
				.andExpect(jsonPath("$.failedJobs.length()").value(1))
				.andExpect(jsonPath("$.failedJobs[0].job").value("daily-reminders"))
				.andExpect(jsonPath("$.failedJobs[0].error").value("IllegalStateException: boom"))
				.andExpect(jsonPath("$.errorsLast5Minutes").isNumber());

		runJob("daily-reminders");
		mvc.perform(MockMvcRequestBuilders.get("/internal/status").header("Authorization", "Bearer " + STATUS_TOKEN)).andExpect(status().isOk())
				.andExpect(jsonPath("$.failedJobs.length()").value(0));
	}
}
