package com.dropzone.api.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class ServerErrorsTest {

	static class MovingClock extends Clock {
		Instant now = Instant.parse("2026-10-30T12:00:00Z");

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	@Test
	void countsOnlyTheLastFiveMinutes() {
		MovingClock clock = new MovingClock();
		ServerErrors errors = new ServerErrors(clock);
		errors.record();
		clock.now = clock.now.plus(Duration.ofMinutes(3));
		errors.record();
		errors.record();
		assertThat(errors.lastWindow()).isEqualTo(3);

		clock.now = clock.now.plus(Duration.ofMinutes(3));
		assertThat(errors.lastWindow()).isEqualTo(2);
		clock.now = clock.now.plus(Duration.ofMinutes(5));
		assertThat(errors.lastWindow()).isZero();
	}
}
