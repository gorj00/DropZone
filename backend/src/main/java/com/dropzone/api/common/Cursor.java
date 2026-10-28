package com.dropzone.api.common;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.UUID;

public record Cursor(Instant at, UUID id) {

	public static final String HEADER = "X-Next-Cursor";
	private static final UUID LOWEST = new UUID(0, 0);

	public static Cursor start(String cursor, Instant before, Instant now) {
		if (cursor != null && !cursor.isBlank()) {
			return parse(cursor.trim());
		}
		return new Cursor(before == null ? now.plusSeconds(1) : before, LOWEST);
	}

	public static Cursor after(Instant at, UUID id) {
		return new Cursor(at, id);
	}

	private static Cursor parse(String value) {
		int split = value.lastIndexOf('_');
		try {
			if (split <= 0) {
				throw new IllegalArgumentException();
			}
			return new Cursor(Instant.parse(value.substring(0, split)), UUID.fromString(value.substring(split + 1)));
		}
		catch (IllegalArgumentException | DateTimeParseException e) {
			throw ApiException.validation("Invalid cursor");
		}
	}

	@Override
	public String toString() {
		return at + "_" + id;
	}
}
