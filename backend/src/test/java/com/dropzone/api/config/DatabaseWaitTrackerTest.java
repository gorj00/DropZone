package com.dropzone.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dropzone.api.common.ServerErrorsTest.MovingClock;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.metrics.IMetricsTracker;
import com.zaxxer.hikari.metrics.MetricsTrackerFactory;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

class DatabaseWaitTrackerTest {

	@Test
	void countsConnectionWaitsOfASecondOrMoreAndTimeouts() {
		CapacityFilter filter = new CapacityFilter(new MovingClock());
		try (HikariDataSource hikari = new HikariDataSource()) {
			hikari.setConnectionTimeout(10_000);
			tracker(filter).postProcessBeforeInitialization(hikari, "dataSource");
			IMetricsTracker pool = hikari.getMetricsTrackerFactory().create("pool", null);

			pool.recordConnectionAcquiredNanos(Duration.ofMillis(999).toNanos());
			assertThat(filter.databaseWaitsLastWindow()).isZero();

			pool.recordConnectionAcquiredNanos(Duration.ofMillis(1500).toNanos());
			pool.recordConnectionTimeout();
			assertThat(filter.databaseWaitsLastWindow()).isEqualTo(2);
		}
	}

	@Test
	void keepsATrackerThatIsAlreadySet() {
		MetricsTrackerFactory own = (poolName, poolStats) -> new IMetricsTracker() {};
		try (HikariDataSource hikari = new HikariDataSource()) {
			hikari.setMetricsTrackerFactory(own);
			tracker(new CapacityFilter(new MovingClock())).postProcessBeforeInitialization(hikari, "dataSource");
			assertThat(hikari.getMetricsTrackerFactory()).isSameAs(own);
		}
	}

	private static DatabaseWaitTracker tracker(CapacityFilter filter) {
		return new DatabaseWaitTracker(new StaticListableBeanFactory(Map.of("capacityFilter", filter)).getBeanProvider(CapacityFilter.class));
	}
}
