package com.dropzone.api.common;

import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	ResponseEntity<ErrorResponse> api(ApiException e) {
		return build(e.status(), e.code(), e.getMessage());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ErrorResponse> invalid(MethodArgumentNotValidException e) {
		String message = e.getBindingResult().getFieldErrors().stream()
				.map(f -> f.getField() + " " + f.getDefaultMessage())
				.collect(Collectors.joining(", "));
		return build(HttpStatus.BAD_REQUEST, "VALIDATION", message.isEmpty() ? "Invalid request" : message);
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
			MissingServletRequestParameterException.class, MissingServletRequestPartException.class })
	ResponseEntity<ErrorResponse> unreadable(Exception e) {
		return build(HttpStatus.BAD_REQUEST, "VALIDATION", "Invalid request");
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	ResponseEntity<ErrorResponse> tooLarge(MaxUploadSizeExceededException e) {
		return build(HttpStatus.BAD_REQUEST, "VALIDATION", "File too large (max 10 MB)");
	}

	@ExceptionHandler(MultipartException.class)
	ResponseEntity<ErrorResponse> multipart(MultipartException e) {
		return build(HttpStatus.BAD_REQUEST, "VALIDATION", "Send the file as multipart/form-data");
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	ResponseEntity<ErrorResponse> mediaType(HttpMediaTypeNotSupportedException e) {
		return build(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "VALIDATION", "Unsupported content type");
	}

	@ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
	ResponseEntity<ErrorResponse> notAcceptable(HttpMediaTypeNotAcceptableException e) {
		return build(HttpStatus.BAD_REQUEST, "VALIDATION", "Responses are JSON only");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	ResponseEntity<ErrorResponse> integrity(DataIntegrityViolationException e) {
		return build(HttpStatus.CONFLICT, "CONFLICT", "Conflicting data");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ResponseEntity<ErrorResponse> denied(AccessDeniedException e) {
		return build(HttpStatus.FORBIDDEN, "FORBIDDEN", "Forbidden");
	}

	@ExceptionHandler(NoResourceFoundException.class)
	ResponseEntity<ErrorResponse> noResource(NoResourceFoundException e) {
		return build(HttpStatus.NOT_FOUND, "NOT_FOUND", "Not found");
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	ResponseEntity<ErrorResponse> method(HttpRequestMethodNotSupportedException e) {
		return build(HttpStatus.METHOD_NOT_ALLOWED, "VALIDATION", "Method not allowed");
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ErrorResponse> unexpected(Exception e) {
		log.error("Unexpected error", e);
		return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL", "Unexpected error");
	}

	private ResponseEntity<ErrorResponse> build(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).body(new ErrorResponse(status.value(), code, message));
	}
}
