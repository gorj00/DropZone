package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.Formula;

@Entity
@Table(name = "user_quests")
public class UserQuest {

	@Id
	public UUID id;

	@Column(nullable = false)
	public UUID userId;

	public Integer questTypeId;

	public String code;

	@Column(nullable = false)
	public String name;

	@Column(nullable = false)
	public String icon;

	@Enumerated(EnumType.STRING)
	@Column(name = "grp", nullable = false)
	public QuestGroup group;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public ProofType proof;

	@Enumerated(EnumType.STRING)
	public AutoSource autoSource;

	public Integer target;

	public boolean custom;

	@Convert(converter = DaysConverter.class)
	@Column(nullable = false)
	public List<Integer> days = List.of(1, 2, 3, 4, 5, 6, 7);

	public boolean squadCheck;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public CheckAudience checkAudience = CheckAudience.FRIENDS;

	@Column(nullable = false)
	public int perDay = 1;

	@Formula("coalesce((select qt.multi_slot from quest_types qt where qt.id = quest_type_id), false)")
	public boolean multiSlot;

	public boolean autoFree;

	public LocalDate startsOn;

	public boolean active = true;

	public int sort;

	@Column(nullable = false)
	public Instant createdAt = Instant.now();

	public boolean scheduledOn(LocalDate date) {
		return (startsOn == null || !date.isBefore(startsOn)) && days.contains(date.getDayOfWeek().getValue());
	}

	public int slots() {
		return Math.max(1, perDay);
	}

	public boolean weightValued() {
		return "WEIGH_IN".equals(code) || proof == ProofType.LOG;
	}
}
