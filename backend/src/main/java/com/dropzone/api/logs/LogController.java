package com.dropzone.api.logs;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.DailyLogDetailDto;
import com.dropzone.api.common.Dtos.DayLogsDto;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/logs")
public class LogController {

	private final LogService logs;

	public LogController(LogService logs) {
		this.logs = logs;
	}

	@GetMapping
	DayLogsDto day(@CurrentUser UUID userId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return logs.day(userId, date);
	}

	@GetMapping("/{id}")
	DailyLogDetailDto detail(@CurrentUser UUID userId, @PathVariable UUID id) {
		return logs.detail(userId, id);
	}
}
