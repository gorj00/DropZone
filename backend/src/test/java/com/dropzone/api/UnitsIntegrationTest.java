package com.dropzone.api;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;

class UnitsIntegrationTest extends IntegrationTest {

	@Test
	void unitsDefaultToMetricAndCanBeChanged() throws Exception {
		Session user = login("Units");
		get(user, "/api/v1/me").andExpect(jsonPath("$.weightUnit").value("KG")).andExpect(jsonPath("$.lengthUnit").value("CM"));

		patch(user, "/api/v1/me", "{\"weightUnit\":\"LB\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.weightUnit").value("LB"))
				.andExpect(jsonPath("$.lengthUnit").value("CM"));
		patch(user, "/api/v1/me", "{\"lengthUnit\":\"IN\"}").andExpect(status().isOk())
				.andExpect(jsonPath("$.weightUnit").value("LB"))
				.andExpect(jsonPath("$.lengthUnit").value("IN"));
		patch(user, "/api/v1/me", "{\"weightUnit\":\"STONE\"}").andExpect(status().isBadRequest());
	}

	@Test
	void onboardingStoresChosenUnitsAndKeepsValuesMetric() throws Exception {
		Session user = login("UnitsOnboard");
		post(user, "/api/v1/onboarding", """
				{"path":"LOSE","metric":"WEIGHT","unit":"kg","startValue":90.7,"goalValue":81.6,"checkpoints":3,
				 "questCodes":["WEIGH_IN"],"weightUnit":"LB","lengthUnit":"IN"}
				""").andExpect(status().isOk())
				.andExpect(jsonPath("$.user.weightUnit").value("LB"))
				.andExpect(jsonPath("$.user.lengthUnit").value("IN"))
				.andExpect(jsonPath("$.goal.unit").value("kg"))
				.andExpect(jsonPath("$.goal.startValue").value(90.7));
	}

	@Test
	void weightProofsExposeTheRawValueInsteadOfText() throws Exception {
		Session owner = loginPro("UnitsFeed");
		addFriends(owner, 3);
		onboardLose(owner, 2, "WEIGH_IN", "HEALTHY_MEAL");
		String weighIn = questId(owner, "WEIGH_IN");
		patch(owner, "/api/v1/quests/" + weighIn, "{\"squadCheck\":true}").andExpect(status().isOk());
		String pending = body(post(owner, "/api/v1/quests/" + weighIn + "/complete",
				"{\"photoUrl\":\"" + photoUrl(owner) + "\",\"value\":88.2,\"mlText\":\"88.2\"}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.value").value(88.2)));
		String proofId = JsonPath.read(pending, "$.proofId");

		get(owner, "/api/v1/proofs/" + proofId).andExpect(status().isOk())
				.andExpect(jsonPath("$.post.value").value(88.2))
				.andExpect(jsonPath("$.post.unit").value("kg"))
				.andExpect(jsonPath("$.post.subtitle").value("AI verified"));
	}

	@Test
	void poundUsersClearMilestonesByEnteringTheDisplayedTarget() throws Exception {
		Session user = login("Pounds");
		patch(user, "/api/v1/me", "{\"weightUnit\":\"LB\"}").andExpect(status().isOk());
		String onboarding = onboardLose(user, 2, "WEIGH_IN");
		String first = JsonPath.read(onboarding, "$.goal.checkpoints[0].id");
		String second = JsonPath.read(onboarding, "$.goal.checkpoints[1].id");
		double displayed = Math.round(85.0 / 0.45359237 * 10) / 10.0;
		post(user, "/api/v1/checkpoints/" + first + "/proof",
				"{\"photoUrl\":\"" + photoUrl(user) + "\",\"value\":" + displayed * 0.45359237 + "}")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CLEARED"));
		post(user, "/api/v1/checkpoints/" + second + "/proof", "{\"photoUrl\":\"" + photoUrl(user) + "\",\"value\":80.05}")
				.andExpect(status().isConflict());
	}

	private String questId(Session session, String code) throws Exception {
		String list = body(get(session, "/api/v1/quests").andExpect(status().isOk()));
		return ((List<String>) JsonPath.read(list, "$[?(@.code=='" + code + "')].id")).getFirst();
	}
}
