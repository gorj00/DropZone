package com.dropzone.api.events;

import com.dropzone.api.domain.AppEventName;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AppEventController {

	public static final String PATH = "/api/v1/events";

	private final AppEventLog log;

	public AppEventController(AppEventLog log) {
		this.log = log;
	}

	public record EventRequest(@NotNull UUID deviceId, @NotNull AppEventName name, @Size(max = 300) String detail,
			@Size(max = 32) String appVersion) {
	}

	@PostMapping(PATH)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void record(@Valid @RequestBody EventRequest request) {
		log.record(request.deviceId(), request.name(), request.detail(), request.appVersion());
	}
}
