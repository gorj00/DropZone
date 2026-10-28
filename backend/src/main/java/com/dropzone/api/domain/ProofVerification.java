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
@Table(name = "proof_verifications")
@IdClass(ProofVerification.Key.class)
public class ProofVerification {

	@Id
	public UUID proofId;

	@Id
	public UUID userId;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public record Key(UUID proofId, UUID userId) implements Serializable {
	}
}
