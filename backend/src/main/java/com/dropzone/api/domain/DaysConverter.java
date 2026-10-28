package com.dropzone.api.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Converter
public class DaysConverter implements AttributeConverter<List<Integer>, String> {

	@Override
	public String convertToDatabaseColumn(List<Integer> days) {
		if (days == null || days.isEmpty()) {
			return "1,2,3,4,5,6,7";
		}
		return days.stream().sorted().distinct().map(String::valueOf).collect(Collectors.joining(","));
	}

	@Override
	public List<Integer> convertToEntityAttribute(String value) {
		if (value == null || value.isBlank()) {
			return List.of(1, 2, 3, 4, 5, 6, 7);
		}
		return Arrays.stream(value.split(",")).map(String::trim).map(Integer::valueOf).toList();
	}
}
