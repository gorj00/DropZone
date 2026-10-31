package com.dropzone.api.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import org.springframework.stereotype.Component;

@Component
public class ServerErrors {

	public static final Duration WINDOW = Duration.ofMinutes(5);

	private final Deque<Instant> recent = new ArrayDeque<>();
	private final Clock clock;

	public ServerErrors(Clock clock) {
		this.clock = clock;
	}

	public synchronized void record() {
		Instant now = clock.instant();
		recent.addLast(now);
		drop(now);
	}

	public synchronized int lastWindow() {
		drop(clock.instant());
		return recent.size();
	}

	private void drop(Instant now) {
		Instant cutoff = now.minus(WINDOW);
		while (!recent.isEmpty() && recent.peekFirst().isBefore(cutoff)) {
			recent.removeFirst();
		}
	}
}
