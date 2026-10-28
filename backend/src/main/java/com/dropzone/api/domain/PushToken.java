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
@Table(name = "push_tokens")
public class PushToken {

	@Id
	public String token;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Platform platform = Platform.ANDROID;

	@Column(nullable = false)
	public Instant updatedAt;
}
