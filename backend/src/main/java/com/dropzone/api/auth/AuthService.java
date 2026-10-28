package com.dropzone.api.auth;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.Dtos.AuthResponse;
import com.dropzone.api.config.AppProperties;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.user.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);

	private final GoogleTokenVerifier googleVerifier;
	private final UserRepository users;
	private final UserService userService;
	private final JwtService jwtService;
	private final AppProperties props;

	public AuthService(GoogleTokenVerifier googleVerifier, UserRepository users, UserService userService, JwtService jwtService,
			AppProperties props) {
		this.googleVerifier = googleVerifier;
		this.users = users;
		this.userService = userService;
		this.jwtService = jwtService;
		this.props = props;
	}

	@Transactional
	public AuthResponse google(String idToken) {
		GoogleTokenVerifier.GoogleIdentity identity = googleVerifier.verify(idToken);
		if (identity.subject() == null || identity.subject().isBlank()) {
			throw ApiException.unauthorized("Invalid Google token");
		}
		if (identity.email() == null || identity.email().isBlank() || !identity.emailVerified()) {
			throw ApiException.unauthorized("Google account email is not verified");
		}
		String email = UserService.normalizeEmail(identity.email());
		User user = users.findByGoogleSub(identity.subject()).orElse(null);
		if (user == null) {
			user = users.findByEmail(email).orElse(null);
			if (user == null) {
				user = userService.create(email, identity.name(), identity.subject(), identity.pictureUrl());
			}
			else if (user.googleSub != null) {
				throw ApiException.conflict("This account is already linked to another Google account");
			}
			else {
				user.googleSub = identity.subject();
			}
		}
		else if (!email.equals(user.email)) {
			if (users.existsByEmailAndIdNot(email, user.id)) {
				log.info("Kept the stored e-mail of user {} because the new Google e-mail belongs to another account", user.id);
			}
			else {
				user.email = email;
			}
		}
		return new AuthResponse(jwtService.issue(user), userService.toDto(user));
	}

	@Transactional
	public AuthResponse dev(String email, String displayName) {
		if (!props.auth().devLogin()) {
			throw ApiException.notFound("Not found");
		}
		String normalized = UserService.normalizeEmail(email);
		User user = users.findByEmail(normalized).orElseGet(() -> userService.create(normalized, displayName, null, null));
		return new AuthResponse(jwtService.issue(user), userService.toDto(user));
	}
}
