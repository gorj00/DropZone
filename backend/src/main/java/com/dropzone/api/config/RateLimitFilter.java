package com.dropzone.api.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

	public static final String CODE = "RATE_LIMITED";
	public static final String MESSAGE = "Slow down a little — try again in a few minutes.";

	public enum Key {
		IP, USER
	}

	public record Budget(String name, String method, String pattern, int capacity, Duration window, Key key) {
	}

	public static final List<Budget> BUDGETS = List.of(
			new Budget("sign-in", "POST", "/api/v1/auth/**", 10, Duration.ofMinutes(1), Key.IP),
			new Budget("uploads", "POST", "/api/v1/uploads", 30, Duration.ofHours(1), Key.USER),
			new Budget("comments", "POST", "/api/v1/feed/*/comments", 30, Duration.ofMinutes(10), Key.USER),
			new Budget("friend-requests", "POST", "/api/v1/social/requests", 20, Duration.ofDays(1), Key.USER),
			new Budget("friend-requests", "POST", "/api/v1/social/invite/*/accept", 20, Duration.ofDays(1), Key.USER),
			new Budget("user-search", "GET", "/api/v1/social/search", 60, Duration.ofHours(1), Key.USER),
			new Budget("user-search", "POST", "/api/v1/social/search", 60, Duration.ofHours(1), Key.USER),
			new Budget("photo-search", "GET", "/api/v1/photos/search", 20, Duration.ofHours(1), Key.USER),
			new Budget("photo-search", "POST", "/api/v1/photos/search", 20, Duration.ofHours(1), Key.USER),
			new Budget("reports", "POST", "/api/v1/reports", 20, Duration.ofDays(1), Key.USER),
			new Budget("hypes", "POST", "/api/v1/feed/*/hype", 120, Duration.ofMinutes(10), Key.USER));

	private static final int MAX_BUCKETS = 100_000;

	private final AntPathMatcher matcher = new AntPathMatcher();
	private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Budget budget = budget(request);
		String subject = budget == null ? null : subject(budget, request);
		if (subject != null) {
			long now = System.nanoTime();
			if (buckets.size() > MAX_BUCKETS) {
				buckets.values().removeIf(bucket -> bucket.full(now));
			}
			long waitNanos = buckets.computeIfAbsent(budget.name() + ":" + subject, k -> new Bucket(budget, now)).take(now);
			if (waitNanos > 0) {
				reject(response, waitNanos);
				return;
			}
		}
		chain.doFilter(request, response);
	}

	private Budget budget(HttpServletRequest request) {
		String path = request.getRequestURI().substring(request.getContextPath().length());
		for (Budget budget : BUDGETS) {
			if (budget.method().equals(request.getMethod()) && matcher.match(budget.pattern(), path)) {
				return budget;
			}
		}
		return null;
	}

	private static String subject(Budget budget, HttpServletRequest request) {
		if (budget.key() == Key.IP) {
			return request.getRemoteAddr();
		}
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		return auth != null && auth.getPrincipal() instanceof Jwt jwt ? jwt.getSubject() : null;
	}

	private static void reject(HttpServletResponse response, long waitNanos) throws IOException {
		response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
		response.setHeader("Retry-After", String.valueOf(Math.max(1, (waitNanos + 999_999_999L) / 1_000_000_000L)));
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.getWriter().write("{\"status\":429,\"code\":\"" + CODE + "\",\"message\":\"" + MESSAGE + "\"}");
	}

	static final class Bucket {

		private final double capacity;
		private final double perNano;
		private double tokens;
		private long updated;

		Bucket(Budget budget, long now) {
			this.capacity = budget.capacity();
			this.perNano = budget.capacity() / (double) budget.window().toNanos();
			this.tokens = capacity;
			this.updated = now;
		}

		synchronized long take(long now) {
			refill(now);
			if (tokens >= 1) {
				tokens -= 1;
				return 0;
			}
			return Math.max(1, (long) Math.ceil((1 - tokens) / perNano));
		}

		synchronized boolean full(long now) {
			refill(now);
			return tokens >= capacity;
		}

		private void refill(long now) {
			tokens = Math.min(capacity, tokens + (now - updated) * perNano);
			updated = now;
		}
	}
}
