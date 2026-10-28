package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "slip_up_types")
public class SlipUpType {

	@Id
	public String code;

	@Column(nullable = false)
	public String name;

	@Column(nullable = false)
	public String icon;

	public int sort;

	public UUID userId;

	public boolean active = true;

	public boolean usableBy(UUID user) {
		return active && (userId == null || userId.equals(user));
	}
}
