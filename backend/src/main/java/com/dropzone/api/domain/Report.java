package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reports")
public class Report {

	@Id
	public UUID id;

	public UUID reporterId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public ReportTarget targetType;

	@Column(nullable = false)
	public UUID targetId;

	public String reason;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
