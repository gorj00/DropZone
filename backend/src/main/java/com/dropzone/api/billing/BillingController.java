package com.dropzone.api.billing;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.UserDto;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BillingController {

	private final BillingService billing;

	public BillingController(BillingService billing) {
		this.billing = billing;
	}

	@PostMapping("/api/v1/billing/refresh")
	UserDto refresh(@CurrentUser UUID userId) {
		return billing.refresh(userId);
	}

	@PostMapping("/api/v1/billing/pending-switch")
	UserDto scheduleSwitch(@CurrentUser UUID userId, @RequestBody PendingSwitchRequest body) {
		return billing.scheduleSwitch(userId, body == null ? null : body.productId());
	}

	record PendingSwitchRequest(String productId) {
	}

	@PostMapping("/api/v1/webhooks/revenuecat")
	ResponseEntity<Void> webhook(@RequestHeader(value = "Authorization", required = false) String authorization,
			@RequestBody(required = false) RevenueCatEvent payload) {
		billing.checkSecret(authorization);
		billing.handle(payload);
		return ResponseEntity.ok().build();
	}
}
