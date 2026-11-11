package com.dropzone.api.auth;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.config.AppProperties;
import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

@Component
public class AppleJwtTokenVerifier implements AppleTokenVerifier {

	static final String ISSUER = "https://appleid.apple.com";
	static final String KEYS_URI = "https://appleid.apple.com/auth/keys";

	private static final Logger log = LoggerFactory.getLogger(AppleJwtTokenVerifier.class);

	private final List<String> audiences;
	private final NimbusJwtDecoder decoder;

	@Autowired
	public AppleJwtTokenVerifier(AppProperties props) {
		this(props.auth().appleClientIds(), NimbusJwtDecoder.withJwkSetUri(KEYS_URI).jwsAlgorithm(SignatureAlgorithm.RS256).build());
	}

	AppleJwtTokenVerifier(List<String> clientIds, NimbusJwtDecoder decoder) {
		this.audiences = clientIds == null ? List.of() : clientIds.stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
		this.decoder = decoder;
		this.decoder.setJwtValidator(validator(audiences));
	}

	private static OAuth2TokenValidator<Jwt> validator(List<String> audiences) {
		JwtTimestampValidator notExpired = new JwtTimestampValidator();
		notExpired.setAllowEmptyExpiryClaim(false);
		return new DelegatingOAuth2TokenValidator<>(notExpired, new JwtIssuerValidator(ISSUER),
				new JwtClaimValidator<Collection<String>>(JwtClaimNames.AUD, aud -> aud != null && aud.stream().anyMatch(audiences::contains)));
	}

	@Override
	public AppleIdentity verify(String idToken) {
		if (audiences.isEmpty()) {
			throw ApiException.unauthorized("Apple sign-in is not configured");
		}
		Jwt token;
		try {
			token = decoder.decode(idToken);
		}
		catch (BadJwtException e) {
			throw ApiException.unauthorized("Invalid Apple token");
		}
		catch (Exception e) {
			log.warn("Could not check an Apple token: {}", e.getMessage());
			throw ApiException.unauthorized("Invalid Apple token");
		}
		Object verified = token.getClaim("email_verified");
		return new AppleIdentity(token.getSubject(), token.getClaimAsString("email"),
				Boolean.TRUE.equals(verified) || (verified instanceof String text && text.trim().equalsIgnoreCase("true")));
	}
}
