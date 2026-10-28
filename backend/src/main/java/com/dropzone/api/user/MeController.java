package com.dropzone.api.user;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.billing.BillingService;
import com.dropzone.api.auth.JwtService;
import com.dropzone.api.common.Dtos.UserDto;
import com.dropzone.api.common.Requests;
import com.dropzone.api.push.PushService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {

	private final UserService users;
	private final AccountService accounts;
	private final JwtService jwtService;
	private final BillingService billing;
	private final PushService push;
	private final DataExportService exports;

	public MeController(UserService users, AccountService accounts, JwtService jwtService, BillingService billing, PushService push,
			DataExportService exports) {
		this.users = users;
		this.accounts = accounts;
		this.jwtService = jwtService;
		this.billing = billing;
		this.push = push;
		this.exports = exports;
	}

	@GetMapping
	UserDto me(@CurrentUser UUID userId, @AuthenticationPrincipal Jwt jwt, HttpServletResponse response) {
		billing.refreshIfDue(userId);
		UserDto me = users.me(userId);
		if (jwtService.needsRefresh(jwt)) {
			response.setHeader(JwtService.REFRESH_HEADER, jwtService.issue(users.get(userId)));
		}
		return me;
	}

	@GetMapping("/export")
	ResponseEntity<DataExport> export(@CurrentUser UUID userId) {
		DataExport export = exports.export(userId);
		String name = "dropzone-export-" + LocalDate.ofInstant(export.exportedAt(), ZoneOffset.UTC) + ".json";
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name).build().toString())
				.contentType(MediaType.APPLICATION_JSON)
				.body(export);
	}

	@PatchMapping
	UserDto update(@CurrentUser UUID userId, @Valid @RequestBody Requests.UpdateMe req) {
		return users.update(userId, req);
	}

	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@CurrentUser UUID userId) {
		accounts.delete(userId);
	}

	@PostMapping("/sign-out-everywhere")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void signOutEverywhere(@CurrentUser UUID userId) {
		users.signOutEverywhere(userId);
		push.unregisterAll(userId);
	}

	@PostMapping("/consent")
	UserDto consent(@CurrentUser UUID userId, @Valid @RequestBody Requests.Consent req) {
		return users.consent(userId, req);
	}

	@PutMapping("/push-token")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void pushToken(@CurrentUser UUID userId, @Valid @RequestBody Requests.PushToken req) {
		push.register(userId, req.token(), req.platform());
	}

	@DeleteMapping("/push-token")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removePushToken(@CurrentUser UUID userId, @Valid @RequestBody Requests.RemovePushToken req) {
		push.unregister(userId, req.token());
	}

	@PutMapping("/locked-apps")
	UserDto lockedApps(@CurrentUser UUID userId, @Valid @RequestBody Requests.LockedApps req) {
		return users.setLockedApps(userId, req.packages());
	}
}
