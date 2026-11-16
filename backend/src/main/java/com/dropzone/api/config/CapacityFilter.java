package com.dropzone.api.config;

import com.dropzone.api.common.RecentEvents;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class CapacityFilter extends OncePerRequestFilter {

	public static final int BUSY_REQUESTS = 32;
	public static final Duration SLOW_DATABASE_WAIT = Duration.ofSeconds(1);

	private final AtomicInteger inFlight = new AtomicInteger();
	private final RecentEvents busy;
	private final RecentEvents databaseWaits;

	public CapacityFilter(Clock clock) {
		this.busy = new RecentEvents(clock);
		this.databaseWaits = new RecentEvents(clock);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		try {
			if (inFlight.incrementAndGet() >= BUSY_REQUESTS) {
				busy.record();
			}
			chain.doFilter(request, response);
		}
		finally {
			inFlight.decrementAndGet();
		}
	}

	public void databaseWait(Duration waited) {
		if (waited.compareTo(SLOW_DATABASE_WAIT) >= 0) {
			databaseWaits.record();
		}
	}

	public int busyLastWindow() {
		return busy.lastWindow();
	}

	public int databaseWaitsLastWindow() {
		return databaseWaits.lastWindow();
	}

	public int inFlight() {
		return inFlight.get();
	}
}
