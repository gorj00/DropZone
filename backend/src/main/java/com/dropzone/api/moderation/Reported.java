package com.dropzone.api.moderation;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.domain.ModerationState;

public final class Reported {

	public static final String UNDER_REVIEW = "This post was reported and is under review. You can share it again once a moderator restores it.";
	public static final String REMOVED = "This post was removed by a moderator and can't be shared again";

	private Reported() {
	}

	public static void requireShareable(ModerationState state) {
		if (state == ModerationState.REMOVED) {
			throw ApiException.conflict(REMOVED);
		}
		if (state == ModerationState.UNDER_REVIEW) {
			throw ApiException.conflict(UNDER_REVIEW);
		}
	}
}
