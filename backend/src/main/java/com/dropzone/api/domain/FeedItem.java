package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "feed_items")
@DynamicUpdate
public class FeedItem {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public FeedType type;

	public UUID proofId;

	public UUID checkpointId;

	public String photoUrl;

	@Column(nullable = false)
	public String title;

	public String subtitle;

	public Double deltaValue;

	@Column(name = "quest_value")
	public Double value;

	public String unit;

	public boolean isPublic;

	public UUID transformationId;

	public boolean hidden;

	public boolean reviewed;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();
}
