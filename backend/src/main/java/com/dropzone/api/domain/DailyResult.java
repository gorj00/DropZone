package com.dropzone.api.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "daily_results")
@IdClass(DailyResult.Key.class)
public class DailyResult {

	@Id
	public UUID userId;

	@Id
	public LocalDate day;

	public int doneCount;

	public int totalCount;

	public Instant proClearedAt;

	public boolean complete() {
		return totalCount > 0 && doneCount >= totalCount;
	}

	public record Key(UUID userId, LocalDate day) implements Serializable {
	}
}
