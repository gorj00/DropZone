package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "job_runs")
public class JobRun {

	@Id
	public String name;

	@Column(nullable = false)
	public Instant lastRunAt;

	public Instant failedAt;

	public String error;
}
