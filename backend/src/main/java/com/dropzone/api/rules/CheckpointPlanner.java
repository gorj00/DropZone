package com.dropzone.api.rules;

import java.util.ArrayList;
import java.util.List;

public final class CheckpointPlanner {

	public static final int MIN = 2;
	public static final int MAX = 10;
	private static final double EPSILON = 1e-6;

	private CheckpointPlanner() {
	}

	public static List<Double> plan(double start, double goal, int count) {
		return plan(start, goal, count, 0);
	}

	public static List<Double> plan(double start, double goal, int count, double minGap) {
		if (count < MIN || count > MAX) {
			throw new IllegalArgumentException("Milestones must be between " + MIN + " and " + MAX);
		}
		for (int n = count; n >= MIN; n--) {
			List<Double> targets = spread(start, goal, n);
			if (spaced(start, targets, minGap)) {
				return targets;
			}
		}
		throw new IllegalArgumentException("The goal is too close to the start for " + MIN + " milestones");
	}

	public static boolean fits(double start, double goal, int count, double minGap) {
		return count >= 1 && spaced(start, spread(start, goal, count), minGap);
	}

	public static List<Double> spread(double from, double to, int count) {
		List<Double> targets = new ArrayList<>(count);
		double step = (to - from) / count;
		for (int i = 1; i < count; i++) {
			targets.add(round1(from + step * i));
		}
		targets.add(to);
		return targets;
	}

	public static boolean spaced(double from, List<Double> targets, double minGap) {
		double previous = from;
		double direction = Math.signum(targets.getLast() - from);
		double need = minGap > 0 ? minGap - EPSILON : EPSILON;
		for (double target : targets) {
			if ((target - previous) * direction < need) {
				return false;
			}
			previous = target;
		}
		return direction != 0;
	}

	public static double round1(double value) {
		return Math.round(value * 10.0) / 10.0;
	}
}
