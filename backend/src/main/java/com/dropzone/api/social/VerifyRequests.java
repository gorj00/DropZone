package com.dropzone.api.social;

import com.dropzone.api.domain.FeedItem;
import com.dropzone.api.domain.FeedItemRepository;
import com.dropzone.api.domain.Proof;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.moderation.BlockService;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class VerifyRequests {

	public static final Duration EVERY = Duration.ofHours(3);
	private static final UUID NOBODY = new UUID(0, 0);

	private final SocialService social;
	private final BlockService blocks;
	private final UserRepository users;
	private final FeedItemRepository feed;
	private final PushService push;
	private final Clock clock;

	public VerifyRequests(SocialService social, BlockService blocks, UserRepository users, FeedItemRepository feed, PushService push,
			Clock clock) {
		this.social = social;
		this.blocks = blocks;
		this.users = users;
		this.feed = feed;
		this.push = push;
		this.clock = clock;
	}

	public void send(User owner, Proof proof, FeedItem item, String body) {
		if (item.hidden) {
			return;
		}
		Instant now = clock.instant();
		for (User friend : social.verifiers(owner.id).stream().sorted(Comparator.comparing(u -> u.id)).toList()) {
			if (!friend.verifyRequestPushes || users.claimVerifyPush(friend.id, now, now.minus(EVERY)) == 0) {
				continue;
			}
			long waiting = Math.max(1, waitingFor(friend.id, now));
			String title = waiting == 1 ? owner.displayName + " needs a verify" : waiting + " proofs need your verify";
			String text = waiting == 1 ? body : owner.displayName + ": " + body;
			push.notify(friend, PushType.VERIFY_REQUEST, title, text,
					Map.of("proofId", proof.id.toString(), "feedItemId", item.id.toString(), "count", Long.toString(waiting)));
		}
	}

	private long waitingFor(UUID userId, Instant now) {
		Set<UUID> friends = new HashSet<>(social.friendIds(userId));
		friends.add(NOBODY);
		Set<UUID> hidden = new HashSet<>(blocks.hiddenUsers(userId));
		hidden.add(NOBODY);
		return feed.countFriendsToVerify(userId, friends, hidden, now, now.minus(User.RENEWAL_LEEWAY));
	}
}
