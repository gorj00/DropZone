package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "slip_ups")
public class SlipUp {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Column(nullable = false)
	public String type;

	@Column(nullable = false)
	public Instant occurredAt;

	public String note;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
