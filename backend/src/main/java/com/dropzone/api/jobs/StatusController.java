package com.dropzone.api.jobs;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.ServerErrors;
import com.dropzone.api.config.AppProperties;
import com.dropzone.api.domain.JobRunRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StatusController {

	public static final String PATH = "/internal/status";

	private final AppProperties props;
	private final JobRunRepository runs;
	private final ServerErrors errors;

	public StatusController(AppProperties props, JobRunRepository runs, ServerErrors errors) {
		this.props = props;
		this.runs = runs;
		this.errors = errors;
	}

	@GetMapping(PATH)
	Status status(@RequestHeader(value = "Authorization", required = false) String authorization) {
		String token = props.jobs() == null ? null : props.jobs().statusToken();
		if (token == null || token.isBlank()) {
			throw ApiException.notFound("Not found");
		}
		byte[] expected = ("Bearer " + token.trim()).getBytes(StandardCharsets.UTF_8);
		if (authorization == null || !MessageDigest.isEqual(expected, authorization.trim().getBytes(StandardCharsets.UTF_8))) {
			throw ApiException.unauthorized("Invalid status token");
		}
		List<FailedJob> failed = runs.findByFailedAtNotNullOrderByName().stream().map(r -> new FailedJob(r.name, r.failedAt, r.error)).toList();
		return new Status(failed, errors.lastWindow());
	}

	public record Status(List<FailedJob> failedJobs, int errorsLast5Minutes) {
	}

	public record FailedJob(String job, Instant failedAt, String error) {
	}
}
