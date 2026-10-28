package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "hypes")
@IdClass(Hype.Key.class)
public class Hype {

	@Id
	public UUID feedItemId;

	@Id
	public UUID userId;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public record Key(UUID feedItemId, UUID userId) implements Serializable {
	}
}
