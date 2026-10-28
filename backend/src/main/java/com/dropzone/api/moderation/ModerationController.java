package com.dropzone.api.moderation;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.AdminReportDto;
import com.dropzone.api.common.Dtos.AdminUserDto;
import com.dropzone.api.common.Dtos.ReportedItemDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.domain.ReportTarget;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class ModerationController {

	private final ModerationService moderation;

	public ModerationController(ModerationService moderation) {
		this.moderation = moderation;
	}

	@PostMapping("/reports")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void report(@CurrentUser UUID userId, @Valid @RequestBody Requests.CreateReport req) {
		moderation.report(userId, req);
	}

	@GetMapping("/admin/reports")
	List<ReportedItemDto> list(@CurrentUser UUID userId) {
		return moderation.list(userId);
	}

	@GetMapping("/admin/reports/{type}/{id}")
	AdminReportDto detail(@CurrentUser UUID userId, @PathVariable ReportTarget type, @PathVariable UUID id) {
		return moderation.detail(userId, type, id);
	}

	@PostMapping("/admin/reports/{type}/{id}/restore")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void restore(@CurrentUser UUID userId, @PathVariable ReportTarget type, @PathVariable UUID id) {
		moderation.restore(userId, type, id);
	}

	@PostMapping("/admin/reports/{type}/{id}/remove")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void remove(@CurrentUser UUID userId, @PathVariable ReportTarget type, @PathVariable UUID id) {
		moderation.remove(userId, type, id);
	}

	@GetMapping("/admin/users/{id}")
	AdminUserDto user(@CurrentUser UUID userId, @PathVariable UUID id) {
		return moderation.user(userId, id);
	}

	@PostMapping("/admin/users/{id}/reset-profile")
	AdminUserDto resetProfile(@CurrentUser UUID userId, @PathVariable UUID id) {
		return moderation.resetProfile(userId, id);
	}

	@PostMapping("/admin/users/{id}/suspend")
	AdminUserDto suspend(@CurrentUser UUID userId, @PathVariable UUID id) {
		return moderation.suspend(userId, id, true);
	}

	@PostMapping("/admin/users/{id}/unsuspend")
	AdminUserDto unsuspend(@CurrentUser UUID userId, @PathVariable UUID id) {
		return moderation.suspend(userId, id, false);
	}
}
