package com.dropzone.api.push;

import com.dropzone.api.domain.Platform;
import com.dropzone.api.domain.PushToken;
import com.dropzone.api.domain.PushTokenRepository;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import java.time.Clock;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class PushService {

	public static final String TAG = "tag";
	public static final String QUIET = "quiet";

	private final PushSender sender;
	private final UserRepository users;
	private final PushTokenRepository tokens;
	private final Clock clock;

	public PushService(PushSender sender, UserRepository users, PushTokenRepository tokens, Clock clock) {
		this.sender = sender;
		this.users = users;
		this.tokens = tokens;
		this.clock = clock;
	}

	@Transactional
	public void register(UUID userId, String token, Platform platform) {
		tokens.upsert(token.trim(), userId, (platform == null ? Platform.ANDROID : platform).name(), clock.instant());
	}

	@Transactional
	public void unregister(UUID userId, String token) {
		tokens.deleteByTokenAndUserId(token.trim(), userId);
	}

	@Transactional
	public void unregisterAll(UUID userId) {
		tokens.deleteByUserId(userId);
	}

	public void notify(User target, PushType type, String title, String body, Map<String, String> extra) {
		if (target == null) {
			return;
		}
		send(target.id, tokens.findByUserId(target.id), type, title, body, extra);
	}

	public void notifyAll(Collection<UUID> userIds, PushType type, String title, String body, Map<String, String> extra) {
		if (userIds.isEmpty()) {
			return;
		}
		notifyEach(users.findByIdIn(userIds), type, title, body, extra);
	}

	public void notifyEach(Collection<User> targets, PushType type, String title, String body, Map<String, String> extra) {
		if (targets.isEmpty()) {
			return;
		}
		Map<UUID, List<PushToken>> byUser = tokens.findByUserIdIn(targets.stream().map(u -> u.id).toList()).stream()
				.collect(Collectors.groupingBy(t -> t.userId));
		for (User user : targets) {
			send(user.id, byUser.getOrDefault(user.id, List.of()), type, title, body, extra);
		}
	}

	private void send(UUID userId, List<PushToken> targets, PushType type, String title, String body, Map<String, String> extra) {
		if (targets.isEmpty()) {
			return;
		}
		Map<String, String> data = new HashMap<>(extra == null ? Map.of() : extra);
		data.put("type", type.name());
		List<String> values = targets.stream().map(t -> t.token).toList();
		Runnable send = () -> {
			for (String token : values) {
				if (sender.send(userId, token, type, title, body, data) == PushSender.Result.DEAD_TOKEN) {
					tokens.deleteDead(token);
				}
			}
		};
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					send.run();
				}
			});
		}
		else {
			send.run();
		}
	}
}
