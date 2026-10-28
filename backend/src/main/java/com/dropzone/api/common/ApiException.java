package com.dropzone.api.common;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}

	public static ApiException notFound(String message) {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
	}

	public static ApiException validation(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION", message);
	}

	public static ApiException forbidden(String message) {
		return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
	}

	public static ApiException conflict(String message) {
		return new ApiException(HttpStatus.CONFLICT, "CONFLICT", message);
	}

	public static ApiException proRequired(String message) {
		return new ApiException(HttpStatus.PAYMENT_REQUIRED, "PRO_REQUIRED", message);
	}

	public static ApiException unauthorized(String message) {
		return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message);
	}
}
