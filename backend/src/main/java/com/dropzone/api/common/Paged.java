package com.dropzone.api.common;

import java.util.List;
import org.springframework.http.ResponseEntity;

public record Paged<T>(List<T> items, String nextCursor) {

	public static <T> ResponseEntity<List<T>> response(Paged<T> page) {
		ResponseEntity.BodyBuilder builder = ResponseEntity.ok();
		if (page.nextCursor() != null) {
			builder.header(Cursor.HEADER, page.nextCursor());
		}
		return builder.body(page.items());
	}
}
