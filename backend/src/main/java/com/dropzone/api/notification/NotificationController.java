package com.dropzone.api.notification;

import com.dropzone.api.auth.CurrentUser;
import com.dropzone.api.common.Dtos.CountDto;
import com.dropzone.api.common.Dtos.NotificationDto;
import com.dropzone.api.common.Paged;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

	private final NotificationService notifications;

	public NotificationController(NotificationService notifications) {
		this.notifications = notifications;
	}

	@GetMapping
	ResponseEntity<List<NotificationDto>> list(@CurrentUser UUID userId, @RequestParam(required = false) Instant before,
			@RequestParam(required = false) String cursor, @RequestParam(required = false) Integer limit) {
		return Paged.response(notifications.list(userId, before, cursor, limit));
	}

	@GetMapping("/unread-count")
	CountDto unread(@CurrentUser UUID userId) {
		return notifications.unread(userId);
	}

	@PostMapping("/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void read(@CurrentUser UUID userId, @RequestBody(required = false) MarkRead body) {
		notifications.markRead(userId, body == null ? null : body.ids());
	}

	record MarkRead(List<UUID> ids) {
	}
}
