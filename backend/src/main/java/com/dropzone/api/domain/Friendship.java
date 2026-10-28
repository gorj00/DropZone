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
@Table(name = "friendships")
@IdClass(Friendship.Key.class)
public class Friendship {

	@Id
	public UUID userId;

	@Id
	public UUID friendId;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public Friendship() {
	}

	public Friendship(UUID userId, UUID friendId) {
		this.userId = userId;
		this.friendId = friendId;
	}

	public record Key(UUID userId, UUID friendId) implements Serializable {
	}
}
