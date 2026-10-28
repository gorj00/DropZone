package com.dropzone.api.jobs;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(JobController.PATH)
public class JobController {

	public static final String PATH = "/internal/jobs";

	private final Jobs jobs;
	private final JobAuth auth;

	public JobController(Jobs jobs, JobAuth auth) {
		this.jobs = jobs;
		this.auth = auth;
	}

	@PostMapping("/{name}")
	Jobs.JobResult run(@PathVariable String name, @RequestHeader(value = "Authorization", required = false) String authorization) {
		auth.check(authorization);
		return jobs.run(name);
	}
}
