package com.dropzone.api.push;

import java.util.Map;
import java.util.UUID;

public interface PushSender {

	Result send(UUID userId, String token, PushType type, String title, String body, Map<String, String> data);

	boolean ready();

	enum Result {
		SENT, DEAD_TOKEN, FAILED
	}
}
