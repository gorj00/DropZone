package com.dropzone.api.moderation;

public interface SafeSearch {

	Verdict check(byte[] image);

	enum Likelihood {
		UNKNOWN, VERY_UNLIKELY, UNLIKELY, POSSIBLE, LIKELY, VERY_LIKELY;

		public boolean likely() {
			return this == LIKELY || this == VERY_LIKELY;
		}

		public static Likelihood parse(String value) {
			try {
				return value == null ? UNKNOWN : valueOf(value);
			}
			catch (IllegalArgumentException e) {
				return UNKNOWN;
			}
		}
	}

	record Verdict(Likelihood adult, Likelihood racy) {

		public boolean flagged() {
			return adult.likely() || racy.likely();
		}
	}
}
