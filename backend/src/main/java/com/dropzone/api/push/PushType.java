package com.dropzone.api.push;

public enum PushType {
	DAILY_REMINDER(Channel.REMINDERS),
	VERIFY_REQUEST(Channel.COMMUNITY),
	VERIFIED(Channel.COMMUNITY),
	HYPE(Channel.COMMUNITY),
	FRIEND_REQUEST(Channel.COMMUNITY),
	FRIEND_ACCEPTED(Channel.COMMUNITY),
	TRIAL_ENDING(Channel.REMINDERS),
	PROOF_REJECTED(Channel.COMMUNITY),
	ADMIN_REPORT(Channel.COMMUNITY),
	TRIAL_ENDED(Channel.REMINDERS),
	BILLING_ISSUE(Channel.ACCOUNT),
	PRO_ENDED(Channel.ACCOUNT),
	PRO_BACK(Channel.ACCOUNT),
	LIFETIME_PRO(Channel.ACCOUNT),
	DEADLINE_REMINDER(Channel.REMINDERS),
	ACCOUNT_DELETION(Channel.ACCOUNT),
	COMMENT(Channel.COMMUNITY),
	COMMENT_REPLY(Channel.COMMUNITY),
	ACCOUNT_SUSPENDED(Channel.ACCOUNT);

	public static final class Channel {
		public static final String REMINDERS = "reminders";
		public static final String COMMUNITY = "community";
		public static final String COMMUNITY_QUIET = "community-quiet";
		public static final String ACCOUNT = "account";

		private Channel() {
		}
	}

	private final String channel;

	PushType(String channel) {
		this.channel = channel;
	}

	public String channel() {
		return channel;
	}
}
