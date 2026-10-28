package com.dropzone.api.onboarding;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.OnboardingResponse;
import com.dropzone.api.common.Requests;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OnboardingController {

	private final OnboardingService onboarding;

	public OnboardingController(OnboardingService onboarding) {
		this.onboarding = onboarding;
	}

	@PostMapping("/api/v1/onboarding")
	OnboardingResponse onboard(@CurrentUser UUID userId, @Valid @RequestBody Requests.Onboarding req) {
		return onboarding.onboard(userId, req);
	}
}
