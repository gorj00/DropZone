package com.dropzone.api.common;

import com.dropzone.api.domain.ServerError;
import com.dropzone.api.domain.ServerErrorRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ServerErrorLog {

	public static final Duration RETENTION = Duration.ofDays(30);
	static final int MAX_MESSAGE = 300;
	static final int MAX_PATH = 512;
	private static final Logger log = LoggerFactory.getLogger(ServerErrorLog.class);

	private final ServerErrorRepository errors;
	private final Clock clock;
	private final String revision;

	public ServerErrorLog(ServerErrorRepository errors, Clock clock, Environment env) {
		this.errors = errors;
		this.clock = clock;
		this.revision = env.getProperty("K_REVISION", env.getProperty("GIT_SHA", "local"));
	}

	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void record(String method, String path, Throwable error, String userId) {
		try {
			Instant now = clock.instant();
			ServerError row = new ServerError();
			row.id = UUID.randomUUID();
			row.at = now;
			row.method = method == null ? "?" : method;
			row.path = cut(path == null ? "?" : path, MAX_PATH);
			row.exception = cut(error.getClass().getSimpleName(), 120);
			row.message = error.getMessage() == null ? null : cut(error.getMessage(), MAX_MESSAGE);
			row.userId = parse(userId);
			row.revision = cut(revision, 64);
			errors.save(row);
			errors.deleteOlderThan(now.minus(RETENTION));
		}
		catch (RuntimeException e) {
			log.warn("Could not store a server error: {}", e.getMessage());
		}
	}

	private static UUID parse(String userId) {
		try {
			return userId == null ? null : UUID.fromString(userId);
		}
		catch (IllegalArgumentException e) {
			return null;
		}
	}

	private static String cut(String value, int max) {
		return value.length() <= max ? value : value.substring(0, max - 1) + "…";
	}
}
