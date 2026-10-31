package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.common.ServerErrorsTest.MovingClock;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class CapacityFilterTest {

	@Test
	void countsRequestsThatArriveWhileTheServerIsNearlyFull() throws Exception {
		MovingClock clock = new MovingClock();
		CapacityFilter filter = new CapacityFilter(clock, () -> 0);
		nested(filter, CapacityFilter.BUSY_REQUESTS + 2);
		assertThat(filter.busyLastWindow()).isEqualTo(3);

		nested(filter, CapacityFilter.BUSY_REQUESTS - 1);
		assertThat(filter.busyLastWindow()).isEqualTo(3);

		clock.now = clock.now.plus(Duration.ofMinutes(6));
		assertThat(filter.busyLastWindow()).isZero();
	}

	@Test
	void countsRequestsThatFindOthersWaitingForADatabaseConnection() throws Exception {
		AtomicInteger waiting = new AtomicInteger();
		CapacityFilter filter = new CapacityFilter(new MovingClock(), waiting::get);
		nested(filter, 1);
		waiting.set(2);
		nested(filter, 2);
		assertThat(filter.databaseWaitsLastWindow()).isEqualTo(2);
		assertThat(filter.busyLastWindow()).isZero();
	}

	private static void nested(CapacityFilter filter, int depth) throws ServletException, IOException {
		FilterChain chain = (request, response) -> {
			if (depth > 1) {
				nested(filter, depth - 1);
			}
		};
		filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/me"), new MockHttpServletResponse(), chain);
	}
}
