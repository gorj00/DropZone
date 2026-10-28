package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "billing_events")
public class BillingEvent {

	@Id
	public String id;

	@Column(nullable = false)
	public String type;

	public String appUserId;

	public String environment;

	@Column(nullable = false)
	public Instant receivedAt;
}
