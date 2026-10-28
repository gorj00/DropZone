package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "measurements")
public class Measurement {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Metric metric;

	@Column(nullable = false)
	public LocalDate day;

	public double value;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
