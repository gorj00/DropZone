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
@Table(name = "app_events")
public class AppEvent {

	@Id
	public UUID id;

	@Column(nullable = false)
	public Instant at;

	@Column(nullable = false)
	public UUID deviceId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public AppEventName name;

	public String detail;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Platform platform;

	public String appVersion;
}
