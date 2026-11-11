package com.dropzone.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.transaction.support.TransactionTemplate;

class PushIntegrationTest extends IntegrationTest {

	@Autowired
	PushService push;

	@Autowired
	UserRepository users;

	@Autowired
	TransactionTemplate tx;

	private void register(Session user, String token) throws Exception {
		put(user, "/api/v1/me/push-token", "{\"token\":\"%s\",\"platform\":\"ANDROID\"}".formatted(token)).andExpect(status().isNoContent());
	}

	private void remove(Session user, String token) throws Exception {
		call(HttpMethod.DELETE, user, "/api/v1/me/push-token", "{\"token\":\"%s\"}".formatted(token)).andExpect(status().isNoContent());
	}

	private void ping(Session user) {
		User target = users.findById(user.id()).orElseThrow();
		push.notify(target, PushType.HYPE, "Hi", "Ping", Map.of());
	}

	private UUID owner(String token) {
		return jdbc.query("select user_id from push_tokens where token = ?", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, token);
	}

	@Test
	void aTokenBelongsToTheLastAccountThatRegisteredIt() throws Exception {
		Session anna = login("PhoneAnna");
		Session ben = login("PhoneBen");
		String phone = "shared-" + UUID.randomUUID();
		register(anna, phone);
		remove(anna, phone);
		register(anna, phone);
		register(ben, phone);
		assertThat(owner(phone)).isEqualTo(ben.id());

		ping(anna);
		assertThat(pushes.toToken(phone)).isEmpty();
		ping(ben);
		assertThat(pushes.toToken(phone)).singleElement().satisfies(sent -> assertThat(sent.userId()).isEqualTo(ben.id()));
	}

	@Test
	void everyDeviceOfAUserGetsThePushUntilItSignsOut() throws Exception {
		Session user = login("TwoPhones");
		Session other = login("NotOwner");
		String first = "phone1-" + UUID.randomUUID();
		String second = "phone2-" + UUID.randomUUID();
		register(user, first);
		register(user, second);

		ping(user);
		assertThat(pushes.toToken(first)).hasSize(1);
		assertThat(pushes.toToken(second)).hasSize(1);

		remove(other, first);
		assertThat(owner(first)).isEqualTo(user.id());
		remove(user, first);
		assertThat(owner(first)).isNull();
		ping(user);
		assertThat(pushes.toToken(first)).hasSize(1);
		assertThat(pushes.toToken(second)).hasSize(2);

		post(user, "/api/v1/me/sign-out-everywhere", null).andExpect(status().isNoContent());
		assertThat(owner(second)).isNull();
	}

	@Test
	void deadTokensAreDeleted() throws Exception {
		Session user = login("DeadToken");
		String dead = "dead-" + UUID.randomUUID();
		String alive = "alive-" + UUID.randomUUID();
		register(user, dead);
		register(user, alive);
		pushes.deadTokens.add(dead);

		tx.executeWithoutResult(status -> ping(user));
		assertThat(owner(dead)).isNull();
		assertThat(owner(alive)).isEqualTo(user.id());
		assertThat(pushes.toToken(alive)).hasSize(1);

		String direct = "dead-" + UUID.randomUUID();
		register(user, direct);
		pushes.deadTokens.add(direct);
		ping(user);
		assertThat(owner(direct)).isNull();
	}

	@Test
	void switchedOffPushTypesAreNotSentButAccountAndTrialPushesAre() throws Exception {
		Session user = login("QuietPhone");
		String token = "quiet-" + UUID.randomUUID();
		register(user, token);
		String[] switches = { "reminderPushes", "deadlinePushes", "hypePushes", "friendPushes", "proofResultPushes" };
		for (String key : switches) {
			get(user, "/api/v1/me").andExpect(jsonPath("$." + key).value(true));
			patch(user, "/api/v1/me", "{\"%s\":false}".formatted(key)).andExpect(jsonPath("$." + key).value(false));
		}

		User target = users.findById(user.id()).orElseThrow();
		for (PushType type : new PushType[] { PushType.DAILY_REMINDER, PushType.DEADLINE_REMINDER, PushType.HYPE, PushType.FRIEND_REQUEST,
				PushType.FRIEND_ACCEPTED, PushType.VERIFIED, PushType.PROOF_REJECTED }) {
			push.notify(target, type, "Hi", "Ping", Map.of());
			push.notifyAll(List.of(user.id()), type, "Hi", "Ping", Map.of());
		}
		assertThat(pushes.toToken(token)).isEmpty();

		push.notify(target, PushType.BILLING_ISSUE, "Hi", "Ping", Map.of());
		push.notify(target, PushType.TRIAL_ENDING, "Hi", "Ping", Map.of());
		push.notify(target, PushType.COMMENT, "Hi", "Ping", Map.of());
		assertThat(pushes.toToken(token)).extracting(p -> p.type()).containsExactly(PushType.BILLING_ISSUE, PushType.TRIAL_ENDING, PushType.COMMENT);

		patch(user, "/api/v1/me", "{\"hypePushes\":true}").andExpect(jsonPath("$.hypePushes").value(true));
		ping(user);
		assertThat(pushes.toToken(token)).extracting(p -> p.type()).endsWith(PushType.HYPE);
	}

	@Test
	void suspendedUsersCanStillRemoveTheirToken() throws Exception {
		Session user = login("SuspendedPhone");
		String token = "suspended-" + UUID.randomUUID();
		register(user, token);
		jdbc.update("update users set suspended_at = now() where id = ?", user.id());
		put(user, "/api/v1/me/push-token", "{\"token\":\"other\"}").andExpect(status().isForbidden());
		remove(user, token);
		assertThat(owner(token)).isNull();
	}

	@Test
	void friendsClearedLeavesOutSuspendedFriends() throws Exception {
		Session me = loginPro("ClearMe");
		Session friend = loginPro("ClearFriend");
		onboardLose(me, 3, "WEIGH_IN");
		joinByInvite(friend, me);
		get(me, "/api/v1/today").andExpect(jsonPath("$.friendsCleared.total").value(1));

		jdbc.update("update users set suspended_at = now() where id = ?", friend.id());
		get(me, "/api/v1/today").andExpect(jsonPath("$.friendsCleared.total").value(0));
	}
}
