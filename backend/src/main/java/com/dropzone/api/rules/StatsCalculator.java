package com.dropzone.api.rules;

public final class StatsCalculator {

	private StatsCalculator() {
	}

	public static int level(int done, int total) {
		if (total <= 0 || done <= 0) {
			return 0;
		}
		double ratio = Math.min(1.0, (double) done / total);
		return Math.max(1, Math.min(4, (int) Math.ceil(ratio * 4 - 1e-9)));
	}

	public static Integer changePct(long current, long previous) {
		if (previous <= 0) {
			return null;
		}
		return (int) Math.round((current - previous) * 100.0 / previous);
	}
}
