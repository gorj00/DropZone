package com.dropzone.api.moderation;

import com.dropzone.api.domain.NotificationType;
import com.dropzone.api.domain.ReportTarget;
import com.dropzone.api.domain.User;
import com.dropzone.api.notification.NotificationService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import com.dropzone.api.user.UserService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class AdminAlerts {

	private final UserService users;
	private final NotificationService notifications;
	private final PushService push;

	public AdminAlerts(UserService users, NotificationService notifications, PushService push) {
		this.users = users;
		this.notifications = notifications;
		this.push = push;
	}

	public void send(UUID except, ReportTarget type, UUID targetId, UUID feedItemId, UUID commentId, String text) {
		List<User> admins = users.admins().stream().filter(admin -> !admin.id.equals(except)).toList();
		for (User admin : admins) {
			notifications.notify(admin.id, NotificationType.ADMIN_REPORT, null, feedItemId, null, commentId, text);
		}
		push.notifyEach(admins, PushType.ADMIN_REPORT, "Report to review", text,
				Map.of("targetType", type.name(), "targetId", targetId.toString()));
	}
}
