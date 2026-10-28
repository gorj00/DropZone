package com.dropzone.api.auth;

import com.dropzone.api.config.AppProperties;
import com.dropzone.api.domain.User;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

	public static final String ISSUER = "dropzone";
	public static final String AUDIENCE = "dropzone-app";
	public static final String VERSION_CLAIM = "ver";
	public static final String REFRESH_HEADER = "X-Auth-Token";
	static final Duration REFRESH_AFTER = Duration.ofDays(1);

	private final JwtEncoder encoder;
	private final AppProperties props;
	private final Clock clock;

	public JwtService(JwtEncoder encoder, AppProperties props, Clock clock) {
		this.encoder = encoder;
		this.props = props;
		this.clock = clock;
	}

	public String issue(User user) {
		Instant now = clock.instant();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer(ISSUER)
				.audience(List.of(AUDIENCE))
				.subject(user.id.toString())
				.claim(VERSION_CLAIM, user.tokenVersion)
				.issuedAt(now)
				.expiresAt(now.plus(props.auth().jwtTtlDays(), ChronoUnit.DAYS))
				.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
	}

	public boolean needsRefresh(Jwt jwt) {
		return jwt.getIssuedAt() == null || jwt.getIssuedAt().isBefore(clock.instant().minus(REFRESH_AFTER));
	}
}
