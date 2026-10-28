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
@Table(name = "quest_completions")
public class QuestCompletion {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userQuestId;

	@Column(nullable = false)
	public UUID userId;

	@Column(nullable = false)
	public LocalDate day;

	@Column(nullable = false)
	public int slot = 1;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public QuestStatus status;

	public Double value;

	public Integer reps;

	public UUID proofId;

	public String summary;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
