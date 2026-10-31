package com.dropzone.api.config;

import com.dropzone.api.common.RecentEvents;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class CapacityFilter extends OncePerRequestFilter {

	public static final int BUSY_REQUESTS = 32;

	private final AtomicInteger inFlight = new AtomicInteger();
	private final RecentEvents busy;
	private final RecentEvents databaseWaits;
	private final IntSupplier waitingForDatabase;

	@Autowired
	public CapacityFilter(Clock clock, DataSource dataSource) {
		this(clock, waiting(dataSource));
	}

	CapacityFilter(Clock clock, IntSupplier waitingForDatabase) {
		this.busy = new RecentEvents(clock);
		this.databaseWaits = new RecentEvents(clock);
		this.waitingForDatabase = waitingForDatabase;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		try {
			if (inFlight.incrementAndGet() >= BUSY_REQUESTS) {
				busy.record();
			}
			if (waitingForDatabase.getAsInt() > 0) {
				databaseWaits.record();
			}
			chain.doFilter(request, response);
		}
		finally {
			inFlight.decrementAndGet();
		}
	}

	public int busyLastWindow() {
		return busy.lastWindow();
	}

	public int databaseWaitsLastWindow() {
		return databaseWaits.lastWindow();
	}

	private static IntSupplier waiting(DataSource dataSource) {
		if (!(dataSource instanceof HikariDataSource hikari)) {
			return () -> 0;
		}
		return () -> {
			HikariPoolMXBean pool = hikari.getHikariPoolMXBean();
			return pool == null ? 0 : pool.getThreadsAwaitingConnection();
		};
	}
}
