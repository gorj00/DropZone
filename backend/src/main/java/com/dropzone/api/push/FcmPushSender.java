package com.dropzone.api.push;

import com.dropzone.api.config.AppProperties;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.AndroidNotification;
import com.google.firebase.messaging.ApnsConfig;
import com.google.firebase.messaging.Aps;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class FcmPushSender implements PushSender {

	private static final Logger log = LoggerFactory.getLogger(FcmPushSender.class);

	private final FirebaseMessaging messaging;

	public FcmPushSender(AppProperties props) {
		this.messaging = init(props.push().firebaseCredentials());
	}

	private static FirebaseMessaging init(String credentialsPath) {
		if (credentialsPath == null || credentialsPath.isBlank()) {
			log.info("FIREBASE_CREDENTIALS not set, push notifications are logged only");
			return null;
		}
		try {
			FirebaseOptions.Builder options = FirebaseOptions.builder().setCredentials(credentials(credentialsPath));
			String projectId = System.getenv("GOOGLE_CLOUD_PROJECT");
			if (projectId != null && !projectId.isBlank()) {
				options.setProjectId(projectId);
			}
			FirebaseApp app = FirebaseApp.getApps().isEmpty() ? FirebaseApp.initializeApp(options.build()) : FirebaseApp.getInstance();
			return FirebaseMessaging.getInstance(app);
		}
		catch (Exception e) {
			log.warn("Could not initialise Firebase messaging, push disabled: {}", e.getMessage());
			return null;
		}
	}

	private static GoogleCredentials credentials(String credentialsPath) throws Exception {
		if ("adc".equalsIgnoreCase(credentialsPath.trim())) {
			return GoogleCredentials.getApplicationDefault();
		}
		try (InputStream in = new FileInputStream(credentialsPath)) {
			return GoogleCredentials.fromStream(in);
		}
	}

	@Override
	public boolean ready() {
		return messaging != null;
	}

	@Override
	public Result send(UUID userId, String token, PushType type, String title, String body, Map<String, String> data) {
		if (messaging == null) {
			log.info("push {} to user {} (log only)", type, userId);
			return Result.SENT;
		}
		try {
			messaging.send(message(token, type, title, body, data));
			return Result.SENT;
		}
		catch (FirebaseMessagingException e) {
			if (deadToken(e.getMessagingErrorCode(), e.getMessage())) {
				log.info("push {} to user {}: token is no longer valid ({})", type, userId, e.getMessagingErrorCode());
				return Result.DEAD_TOKEN;
			}
			log.warn("Push failed: {} {}", e.getMessagingErrorCode(), e.getMessage());
			return Result.FAILED;
		}
		catch (Exception e) {
			log.warn("Push failed: {}", e.getMessage());
			return Result.FAILED;
		}
	}

	static Message message(String token, PushType type, String title, String body, Map<String, String> data) {
		AndroidNotification.Builder android = AndroidNotification.builder()
				.setChannelId(data.containsKey(PushService.QUIET) ? PushType.Channel.COMMUNITY_QUIET : type.channel());
		if (data.containsKey(PushService.TAG)) {
			android.setTag(data.get(PushService.TAG));
		}
		return Message.builder()
				.setToken(token)
				.setNotification(Notification.builder().setTitle(title).setBody(body).build())
				.setAndroidConfig(AndroidConfig.builder().setNotification(android.build()).build())
				.setApnsConfig(ApnsConfig.builder().setAps(Aps.builder().setSound("default").build()).build())
				.putAllData(data)
				.build();
	}

	static boolean deadToken(MessagingErrorCode code, String message) {
		if (code == MessagingErrorCode.UNREGISTERED) {
			return true;
		}
		return code == MessagingErrorCode.INVALID_ARGUMENT && message != null
				&& message.toLowerCase(Locale.ROOT).contains("registration token");
	}
}
