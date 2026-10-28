package com.dropzone.api.rules;

import com.dropzone.api.domain.UnlockMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

public final class UnlockCalculator {

	private UnlockCalculator() {
	}

	public record UnlockState(boolean unlocked, Instant unlockedUntil, int minutesEarned) {
	}

	public static boolean activeAt(UnlockState state, LocalDate day, ZoneId zone, Instant now) {
		Instant end = state.unlockedUntil() != null ? state.unlockedUntil() : day.plusDays(1).atStartOfDay(zone).toInstant();
		return end.isAfter(now);
	}

	public static UnlockState compute(UnlockMode mode, int done, int total, int minutesPerQuest, LocalDate day, ZoneId zone) {
		boolean allDone = done >= total;
		Instant midnight = day.plusDays(1).atStartOfDay(zone).toInstant();
		if (mode == UnlockMode.MINUTES) {
			int minutes = done * minutesPerQuest;
			if (allDone) {
				return new UnlockState(true, midnight, minutes);
			}
			return new UnlockState(minutes > 0, null, minutes);
		}
		return allDone ? new UnlockState(true, midnight, 0) : new UnlockState(false, null, 0);
	}
}
