package com.dropzone.api.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Converter
public class StringListConverter implements AttributeConverter<List<String>, String> {

	private static final String SEPARATOR = "\u001f";

	@Override
	public String convertToDatabaseColumn(List<String> values) {
		if (values == null || values.isEmpty()) {
			return null;
		}
		return String.join(SEPARATOR, values);
	}

	@Override
	public List<String> convertToEntityAttribute(String value) {
		if (value == null || value.isEmpty()) {
			return new ArrayList<>();
		}
		return new ArrayList<>(Arrays.asList(value.split(SEPARATOR)));
	}
}
