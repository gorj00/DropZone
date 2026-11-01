package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "server_errors")
public class ServerError {

	@Id
	public UUID id;

	@Column(nullable = false)
	public Instant at;

	@Column(nullable = false)
	public String method;

	@Column(nullable = false)
	public String path;

	@Column(nullable = false)
	public String exception;

	public String message;

	public UUID userId;

	public String revision;
}
