package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "goals")
@DynamicUpdate
public class Goal {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Path path;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Metric metric;

	public String metricLabel;

	@Column(nullable = false)
	public String unit;

	public double startValue;

	public double goalValue;

	public double currentValue;

	public boolean active = true;

	public Instant endedAt;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public boolean reached(double value, double target, double tolerance) {
		double slack = Math.max(tolerance, 1e-9);
		return path == Path.LOSE ? value <= target + slack : value >= target - slack;
	}
}
