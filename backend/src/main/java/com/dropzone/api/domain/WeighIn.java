package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "weigh_ins")
public class WeighIn {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Column(nullable = false)
	public LocalDate day;

	public double value;

	public String photoUrl;

	public String mlText;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
