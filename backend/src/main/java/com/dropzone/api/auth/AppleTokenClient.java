package com.dropzone.api.auth;

import java.util.Optional;

public interface AppleTokenClient {

	Optional<String> refreshToken(String authorizationCode);

	boolean revoke(String refreshToken);
}
