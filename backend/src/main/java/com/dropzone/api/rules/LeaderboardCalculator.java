package com.dropzone.api.rules;

import com.dropzone.api.domain.Metric;
import com.dropzone.api.domain.Path;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class LeaderboardCalculator {

	public static final double MAX_WEIGHT_CHANGE_PER_WEEK = 3.0;
	public static final double MAX_RELATIVE_CHANGE = 0.30;

	private LeaderboardCalculator() {
	}

	public record Point(LocalDate day, double value) {
	}

	public record Change(double delta, Double percent) {
	}

	public record Ranked(UUID userId, int rank, double delta, Double percent) {
	}

	public static List<Point> plausible(Metric metric, List<Point> points) {
		List<Point> kept = new ArrayList<>();
		for (Point point : points) {
			if (kept.isEmpty() || plausible(metric, kept.getLast(), point)) {
				kept.add(point);
			}
		}
		return kept;
	}

	static boolean plausible(Metric metric, Point from, Point to) {
		double change = Math.abs(to.value() - from.value());
		if (metric == Metric.WEIGHT) {
			long days = Math.max(0, ChronoUnit.DAYS.between(from.day(), to.day()));
			return change <= MAX_WEIGHT_CHANGE_PER_WEEK * Math.max(1.0, days / 7.0) + 1e-9;
		}
		return from.value() <= 0 || change <= from.value() * MAX_RELATIVE_CHANGE + 1e-9;
	}

	public static Double delta(Path path, List<Point> points, LocalDate start, LocalDate end) {
		Change change = change(path, points, start, end);
		return change == null ? null : change.delta();
	}

	public static Change change(Path path, List<Point> points, LocalDate start, LocalDate end) {
		Double baseline = null;
		Double latest = null;
		for (Point point : points) {
			if (point.day().isBefore(start)) {
				baseline = point.value();
			}
			else if (!point.day().isAfter(end)) {
				if (baseline == null) {
					baseline = point.value();
				}
				latest = point.value();
			}
		}
		if (baseline == null || latest == null) {
			return null;
		}
		double change = path == Path.LOSE ? baseline - latest : latest - baseline;
		Double percent = baseline > 0 ? CheckpointPlanner.round1(change / baseline * 100) : null;
		return new Change(CheckpointPlanner.round1(change), percent);
	}

	public static List<Ranked> rank(Path path, Metric metric, Map<UUID, List<Point>> pointsByUser, Map<UUID, String> namesByUser,
			LocalDate start, LocalDate end) {
		List<Ranked> changes = new ArrayList<>();
		for (Map.Entry<UUID, List<Point>> entry : pointsByUser.entrySet()) {
			Change change = change(path, plausible(metric, entry.getValue()), start, end);
			if (change != null) {
				changes.add(new Ranked(entry.getKey(), 0, change.delta(), change.percent()));
			}
		}
		changes.sort(Comparator.comparingDouble((Ranked r) -> score(path, r)).reversed()
				.thenComparing(r -> namesByUser.getOrDefault(r.userId(), "")));
		List<Ranked> ranked = new ArrayList<>();
		for (int i = 0; i < changes.size(); i++) {
			Ranked r = changes.get(i);
			int rank = i > 0 && Double.compare(score(path, r), score(path, changes.get(i - 1))) == 0 ? ranked.getLast().rank() : i + 1;
			ranked.add(new Ranked(r.userId(), rank, r.delta(), r.percent()));
		}
		return ranked;
	}

	static double score(Path path, Ranked r) {
		if (path == Path.GAIN) {
			return r.percent() == null ? 0 : r.percent();
		}
		return r.delta();
	}
}
