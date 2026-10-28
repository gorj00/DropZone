package com.dropzone.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;

@Entity
@Table(name = "quest_types")
public class QuestType {

	@Id
	public Integer id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	public Path path;

	@Column(nullable = false)
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

	public boolean free;

	public boolean multiSlot;

	@Enumerated(EnumType.STRING)
	public AutoSource autoSource;

	public Integer target;

	@Convert(converter = DaysConverter.class)
	@Column(nullable = false)
	public List<Integer> defaultDays = List.of(1, 2, 3, 4, 5, 6, 7);

	@Column(nullable = false)
	public int defaultPerDay = 1;

	public int sort;
}
