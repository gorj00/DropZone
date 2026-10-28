package com.dropzone.api;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class ApiApplicationTests extends IntegrationTest {

	@Test
	void healthIsPublic() throws Exception {
		mvc.perform(MockMvcRequestBuilders.get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void apiRequiresToken() throws Exception {
		mvc.perform(MockMvcRequestBuilders.get("/api/v1/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
	}

	@Test
	void questCatalogAndSlipUpTypesAreSeeded() throws Exception {
		Session user = login("Seed");
		get(user, "/api/v1/quests/catalog").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(24))
				.andExpect(jsonPath("$[?(@.path=='LOSE' && @.code=='STEPS')].target").value(8000))
				.andExpect(jsonPath("$[?(@.path=='GAIN' && @.free==true)].code").value(containsInAnyOrder(
						"WEIGH_IN", "PROTEIN_MEAL", "GYM")));
		get(user, "/api/v1/slip-ups/types").andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(7))
				.andExpect(jsonPath("$[5].name").value("Sweets binge"));
	}
}
