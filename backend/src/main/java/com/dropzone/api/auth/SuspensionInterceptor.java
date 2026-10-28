package com.dropzone.api.auth;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.domain.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class SuspensionInterceptor implements HandlerInterceptor {

	public static final String CODE = "SUSPENDED";
	private static final String ME = "/api/v1/me";
	private static final String PUSH_TOKEN = "/api/v1/me/push-token";
	private static final String EXPORT = "/api/v1/me/export";

	private final UserRepository users;

	public SuspensionInterceptor(UserRepository users) {
		this.users = users;
	}

	@Override
	public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt) || allowed(request)) {
			return true;
		}
		UUID id;
		try {
			id = UUID.fromString(jwt.getSubject());
		}
		catch (IllegalArgumentException | NullPointerException e) {
			return true;
		}
		if (users.isSuspended(id)) {
			throw new ApiException(HttpStatus.FORBIDDEN, CODE, "Your account is suspended");
		}
		return true;
	}

	private static boolean allowed(HttpServletRequest request) {
		String path = request.getRequestURI().substring(request.getContextPath().length());
		String method = request.getMethod();
		return ME.equals(path) && ("GET".equals(method) || "DELETE".equals(method)) || PUSH_TOKEN.equals(path) && "DELETE".equals(method)
				|| EXPORT.equals(path) && "GET".equals(method);
	}
}
