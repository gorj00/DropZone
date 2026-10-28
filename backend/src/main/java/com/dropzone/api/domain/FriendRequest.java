package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "friend_requests")
public class FriendRequest {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID fromUserId;

	@Column(nullable = false)
	public UUID toUserId;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
