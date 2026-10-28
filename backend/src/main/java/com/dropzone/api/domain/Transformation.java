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
@Table(name = "transformations")
public class Transformation {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Column(nullable = false)
	public String beforeUrl;

	@Column(nullable = false)
	public String afterUrl;

	public String beforeCaption;

	public String afterCaption;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public TransformationLayout layout = TransformationLayout.SPLIT;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public PostVisibility visibility = PostVisibility.PRIVATE;

	public boolean removedByModerator;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	@Column(nullable = false)
	public Instant updatedAt = Instant.now();
}
