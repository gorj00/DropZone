package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.common.ServerErrorsTest.MovingClock;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class CapacityFilterTest {

	@Test
	void countsRequestsThatArriveWhileTheServerIsNearlyFull() throws Exception {
		MovingClock clock = new MovingClock();
		CapacityFilter filter = new CapacityFilter(clock);
		nested(filter, CapacityFilter.BUSY_REQUESTS + 2);
		assertThat(filter.busyLastWindow()).isEqualTo(3);

		nested(filter, CapacityFilter.BUSY_REQUESTS - 1);
		assertThat(filter.busyLastWindow()).isEqualTo(3);

		clock.now = clock.now.plus(Duration.ofMinutes(6));
		assertThat(filter.busyLastWindow()).isZero();
	}

	@Test
	void countsOnlyDatabaseWaitsOfASecondOrMore() throws Exception {
		MovingClock clock = new MovingClock();
		CapacityFilter filter = new CapacityFilter(clock);
		filter.databaseWait(Duration.ofMillis(999));
		nested(filter, 3);
		assertThat(filter.databaseWaitsLastWindow()).isZero();

		filter.databaseWait(Duration.ofSeconds(1));
		filter.databaseWait(Duration.ofSeconds(10));
		assertThat(filter.databaseWaitsLastWindow()).isEqualTo(2);
		assertThat(filter.busyLastWindow()).isZero();

		clock.now = clock.now.plus(Duration.ofMinutes(6));
		assertThat(filter.databaseWaitsLastWindow()).isZero();
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
