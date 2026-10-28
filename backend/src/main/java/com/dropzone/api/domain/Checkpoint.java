package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "checkpoints")
@DynamicUpdate
public class Checkpoint {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID goalId;

	@Column(name = "idx", nullable = false)
	public int index;

	public double targetValue;

	public String rewardTitle;

	public String rewardImageUrl;

	public String rewardImageCreditName;

	public String rewardImageCreditLink;

	public boolean isPublic;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public PostVisibility visibility = PostVisibility.PRIVATE;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Verification verification = Verification.AI;

	public LocalDate deadline;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public CheckpointStatus status = CheckpointStatus.LOCKED;

	public Instant clearedAt;

	public UUID proofId;

	public void setVisibility(PostVisibility visibility) {
		this.visibility = visibility;
		this.isPublic = visibility == PostVisibility.EVERYONE;
	}

	public boolean submitted() {
		return status == CheckpointStatus.PENDING_VERIFICATION || status == CheckpointStatus.CLEARED;
	}
}
