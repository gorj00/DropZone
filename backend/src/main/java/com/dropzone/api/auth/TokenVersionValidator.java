package com.dropzone.api.auth;

import com.dropzone.api.domain.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

@Component
public class TokenVersionValidator implements OAuth2TokenValidator<Jwt> {

	private static final OAuth2Error REVOKED = new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, "Token was revoked", null);

	private final UserRepository users;

	public TokenVersionValidator(UserRepository users) {
		this.users = users;
	}

	@Override
	public OAuth2TokenValidatorResult validate(Jwt jwt) {
		UUID id;
		try {
			id = UUID.fromString(jwt.getSubject());
		}
		catch (IllegalArgumentException | NullPointerException e) {
			return OAuth2TokenValidatorResult.failure(REVOKED);
		}
		Object claim = jwt.getClaims().get(JwtService.VERSION_CLAIM);
		if (!(claim instanceof Number version)) {
			return OAuth2TokenValidatorResult.failure(REVOKED);
		}
		Optional<Integer> current = users.findTokenVersion(id);
		if (current.isEmpty() || current.get() != version.intValue()) {
			return OAuth2TokenValidatorResult.failure(REVOKED);
		}
		return OAuth2TokenValidatorResult.success();
	}
}
