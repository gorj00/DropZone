package com.dropzone.api.domain;

public enum ModerationState {
	UNDER_REVIEW, REMOVED;

	public static ModerationState of(boolean removed, boolean underReview) {
		return removed ? REMOVED : underReview ? UNDER_REVIEW : null;
	}
}
