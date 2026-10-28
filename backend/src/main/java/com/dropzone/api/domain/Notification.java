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
@Table(name = "notifications")
public class Notification {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public NotificationType type;

	public UUID actorId;

	public UUID feedItemId;

	public UUID proofId;

	public UUID commentId;

	public String text;

	public Instant readAt;

	public boolean retracted;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
