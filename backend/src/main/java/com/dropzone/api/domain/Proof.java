package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "proofs")
@DynamicUpdate
public class Proof {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public ProofKind kind;

	@Column(nullable = false)
	public UUID refId;

	public String photoUrl;

	public Double value;

	@Convert(converter = StringListConverter.class)
	public List<String> mlLabels = new ArrayList<>();

	public String mlText;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public ProofStatus status;

	public int requiredVerifications;

	public int verifiedCount;

	public boolean isPublic;

	public boolean aiChecked;

	public boolean removedByModerator;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
