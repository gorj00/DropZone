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
@Table(name = "blocks")
@IdClass(Block.Key.class)
public class Block {

	@Id
	public UUID blockerId;

	@Id
	public UUID blockedId;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public Block() {
	}

	public Block(UUID blockerId, UUID blockedId) {
		this.blockerId = blockerId;
		this.blockedId = blockedId;
	}

	public record Key(UUID blockerId, UUID blockedId) implements Serializable {
	}
}
