package com.dropzone.api.common;

public record ErrorResponse(int status, String code, String message) {
}
