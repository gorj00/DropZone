package com.dropzone.api.rules;

import java.time.LocalDate;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;

public final class StreakCalculator {

	private static final Predicate<LocalDate> NO_REST_DAYS = day -> false;

	private StreakCalculator() {
	}

	public static int current(Set<LocalDate> completeDays, LocalDate today) {
		return current(completeDays, NO_REST_DAYS, today);
	}

	public static int current(Set<LocalDate> completeDays, Predicate<LocalDate> restDay, LocalDate today) {
		if (completeDays.isEmpty()) {
			return 0;
		}
		LocalDate first = Collections.min(completeDays);
		LocalDate cursor = completeDays.contains(today) ? today : today.minusDays(1);
		int streak = 0;
		while (!cursor.isBefore(first)) {
			if (completeDays.contains(cursor)) {
				streak++;
			}
			else if (!restDay.test(cursor)) {
				break;
			}
			cursor = cursor.minusDays(1);
		}
		return streak;
	}

	public static int best(Set<LocalDate> completeDays) {
		return best(completeDays, NO_REST_DAYS);
	}

	public static int best(Set<LocalDate> completeDays, Predicate<LocalDate> restDay) {
		int best = 0;
		int run = 0;
		LocalDate previous = null;
		for (LocalDate day : new TreeSet<>(completeDays)) {
			run = previous != null && onlyRestDaysBetween(previous, day, restDay) ? run + 1 : 1;
			best = Math.max(best, run);
			previous = day;
		}
		return best;
	}

	private static boolean onlyRestDaysBetween(LocalDate from, LocalDate to, Predicate<LocalDate> restDay) {
		for (LocalDate day = from.plusDays(1); day.isBefore(to); day = day.plusDays(1)) {
			if (!restDay.test(day)) {
				return false;
			}
		}
		return true;
	}
}
