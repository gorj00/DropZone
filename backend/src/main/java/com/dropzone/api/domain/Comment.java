package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "comments")
public class Comment {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID feedItemId;

	@Column(nullable = false)
	public UUID userId;

	@Column(nullable = false)
	public String body;

	public boolean hidden;

	public boolean reviewed;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
