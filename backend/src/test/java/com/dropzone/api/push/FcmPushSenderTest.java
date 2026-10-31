package com.dropzone.api.push;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.firebase.messaging.MessagingErrorCode;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FcmPushSenderTest {

	@Test
	void unregisteredAndInvalidTokensAreDead() {
		assertThat(FcmPushSender.deadToken(MessagingErrorCode.UNREGISTERED, "Requested entity was not found.")).isTrue();
		assertThat(FcmPushSender.deadToken(MessagingErrorCode.INVALID_ARGUMENT, "The registration token is not a valid FCM registration token"))
				.isTrue();
		assertThat(FcmPushSender.deadToken(MessagingErrorCode.INVALID_ARGUMENT, "Message payload is too large")).isFalse();
		assertThat(FcmPushSender.deadToken(MessagingErrorCode.UNAVAILABLE, "registration token")).isFalse();
		assertThat(FcmPushSender.deadToken(null, null)).isFalse();
	}

	@Test
	void everyTypeHasAnAndroidChannel() {
		assertThat(PushType.DAILY_REMINDER.channel()).isEqualTo("reminders");
		assertThat(PushType.TRIAL_ENDING.channel()).isEqualTo("reminders");
		assertThat(PushType.TRIAL_ENDED.channel()).isEqualTo("reminders");
		for (PushType type : new PushType[] { PushType.VERIFY_REQUEST, PushType.VERIFIED, PushType.HYPE, PushType.FRIEND_REQUEST,
				PushType.FRIEND_ACCEPTED, PushType.PROOF_REJECTED, PushType.ADMIN_REPORT, PushType.COMMENT }) {
			assertThat(type.channel()).isEqualTo("community");
		}
		for (PushType type : new PushType[] { PushType.BILLING_ISSUE, PushType.PRO_ENDED, PushType.PRO_BACK, PushType.ACCOUNT_SUSPENDED }) {
			assertThat(type.channel()).isEqualTo("account");
		}
		assertThat(FcmPushSender.message("token", PushType.PRO_ENDED, "t", "b", Map.of("type", "PRO_ENDED"))).isNotNull();
		assertThat(FcmPushSender.message("token", PushType.COMMENT, "t", "b", Map.of(PushService.TAG, "comments-1", PushService.QUIET, "1")))
				.isNotNull();
	}
}
