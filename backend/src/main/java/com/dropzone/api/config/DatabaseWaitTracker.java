package com.dropzone.api.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.metrics.IMetricsTracker;
import com.zaxxer.hikari.metrics.MetricsTrackerFactory;
import com.zaxxer.hikari.metrics.PoolStats;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.stereotype.Component;

@Component
public class DatabaseWaitTracker implements BeanPostProcessor {

	private final ObjectProvider<CapacityFilter> capacity;

	public DatabaseWaitTracker(ObjectProvider<CapacityFilter> capacity) {
		this.capacity = capacity;
	}

	@Override
	public Object postProcessBeforeInitialization(Object bean, String beanName) {
		if (bean instanceof HikariDataSource hikari && hikari.getMetricsTrackerFactory() == null && hikari.getMetricRegistry() == null) {
			hikari.setMetricsTrackerFactory(new Factory(capacity::getObject, hikari));
		}
		return bean;
	}

	public record Factory(Supplier<CapacityFilter> capacity, HikariConfig config) implements MetricsTrackerFactory {

		@Override
		public IMetricsTracker create(String poolName, PoolStats poolStats) {
			CapacityFilter filter = capacity.get();
			return new IMetricsTracker() {
				@Override
				public void recordConnectionAcquiredNanos(long elapsedAcquiredNanos) {
					filter.databaseWait(Duration.ofNanos(elapsedAcquiredNanos));
				}

				@Override
				public void recordConnectionTimeout() {
					filter.databaseWait(Duration.ofMillis(config.getConnectionTimeout()));
				}
			};
		}
	}
}
