package com.dropzone.api.events;

import com.dropzone.api.common.ApiException;
import com.dropzone.api.common.ClientPlatform;
import com.dropzone.api.domain.AppEvent;
import com.dropzone.api.domain.AppEventName;
import com.dropzone.api.domain.AppEventRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AppEventLog {

	public static final Duration RETENTION = Duration.ofDays(90);
	private static final Pattern STEP = Pattern.compile("[a-z-]{1,20}");

	private final AppEventRepository events;
	private final Clock clock;

	public AppEventLog(AppEventRepository events, Clock clock) {
		this.events = events;
		this.clock = clock;
	}

	@Transactional
	public void record(UUID deviceId, AppEventName name, String detail, String appVersion) {
		String text = detail == null || detail.isBlank() ? null : detail.strip();
		if (name == AppEventName.ONBOARDING_STEP && (text == null || !STEP.matcher(text).matches())) {
			throw ApiException.validation("Unknown onboarding step");
		}
		Instant now = clock.instant();
		AppEvent row = new AppEvent();
		row.id = UUID.randomUUID();
		row.at = now;
		row.deviceId = deviceId;
		row.name = name;
		row.detail = text;
		row.platform = ClientPlatform.current();
		row.appVersion = appVersion == null || appVersion.isBlank() ? null : appVersion.strip();
		events.save(row);
		events.deleteOlderThan(now.minus(RETENTION));
	}
}
