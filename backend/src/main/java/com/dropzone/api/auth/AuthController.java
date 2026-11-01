package com.dropzone.api.auth;

import com.dropzone.api.common.Dtos.AuthResponse;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/google")
	AuthResponse google(@Valid @RequestBody Requests.GoogleAuth req) {
		return authService.google(req.idToken());
	}

	@PostMapping("/admin")
	AuthResponse admin(@Valid @RequestBody Requests.GoogleAuth req) {
		return authService.admin(req.idToken());
	}

	@PostMapping("/dev")
	AuthResponse dev(@Valid @RequestBody Requests.DevAuth req) {
		return authService.dev(req.email(), req.displayName());
	}
}
