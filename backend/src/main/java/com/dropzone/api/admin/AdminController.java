package com.dropzone.api.admin;

import com.dropzone.api.admin.AdminDtos.Account;
import com.dropzone.api.admin.AdminDtos.BillingEventView;
import com.dropzone.api.admin.AdminDtos.DayView;
import com.dropzone.api.admin.AdminDtos.ErrorView;
import com.dropzone.api.admin.AdminDtos.JobView;
import com.dropzone.api.admin.AdminDtos.Overview;
import com.dropzone.api.admin.AdminDtos.UserPage;
import com.dropzone.api.auth.CurrentUser;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

	private final AdminService admin;

	public AdminController(AdminService admin) {
		this.admin = admin;
	}

	@GetMapping("/overview")
	Overview overview(@CurrentUser UUID userId, @RequestParam(defaultValue = "true") boolean sandbox) {
		return admin.overview(userId, sandbox);
	}

	@GetMapping("/jobs")
	List<JobView> jobs(@CurrentUser UUID userId) {
		return admin.jobs(userId);
	}

	@GetMapping("/users")
	UserPage users(@CurrentUser UUID userId, @RequestParam(required = false) String q, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		return admin.users(userId, q, page, size);
	}

	@GetMapping("/users/{id}/account")
	Account account(@CurrentUser UUID userId, @PathVariable UUID id) {
		return admin.account(userId, id);
	}

	@GetMapping("/users/{id}/days")
	List<DayView> days(@CurrentUser UUID userId, @PathVariable UUID id,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return admin.days(userId, id, from, to);
	}

	@GetMapping("/errors")
	List<ErrorView> errors(@CurrentUser UUID userId, @RequestParam(defaultValue = "100") int limit) {
		return admin.errors(userId, limit);
	}

	@GetMapping("/billing-events")
	List<BillingEventView> billingEvents(@CurrentUser UUID userId, @RequestParam(defaultValue = "100") int limit,
			@RequestParam(defaultValue = "true") boolean sandbox) {
		return admin.billingEvents(userId, limit, sandbox);
	}
}
