package com.dropzone.api.user;

import com.dropzone.api.common.Tally;
import com.dropzone.api.domain.User;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.push.PushService;
import com.dropzone.api.push.PushType;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class InactiveAccounts {

	public static final int INACTIVE_MONTHS = 24;
	public static final Duration WARNING_AHEAD = Duration.ofDays(30);

	private static final Logger log = LoggerFactory.getLogger(InactiveAccounts.class);

	private final UserRepository users;
	private final AccountService accounts;
	private final PushService push;
	private final Clock clock;
	private final TransactionTemplate tx;

	public InactiveAccounts(UserRepository users, AccountService accounts, PushService push, Clock clock, TransactionTemplate tx) {
		this.users = users;
		this.accounts = accounts;
		this.push = push;
		this.clock = clock;
		this.tx = tx;
	}

	public Tally run() {
		Instant now = clock.instant();
		Instant deleteSeenBefore = now.atZone(ZoneOffset.UTC).minusMonths(INACTIVE_MONTHS).toInstant();
		Instant warnSeenBefore = deleteSeenBefore.plus(WARNING_AHEAD);
		int warned = 0;
		int deleted = 0;
		int failed = 0;
		for (UUID id : users.findDeletionWarningIds(warnSeenBefore)) {
			try {
				User user = tx.execute(status -> {
					User u = users.findById(id).orElse(null);
					return u == null || u.isSubscribed(now) || users.claimDeletionWarning(id, now, warnSeenBefore) == 0 ? null : u;
				});
				if (user != null) {
					push.notify(user, PushType.ACCOUNT_DELETION, "Your DropZone account will be deleted soon",
							"You haven't opened DropZone in almost two years. Open the app within 30 days to keep your account and data.",
							Map.of());
					warned++;
				}
			}
			catch (RuntimeException e) {
				failed++;
				log.warn("job=inactive-accounts user={} warning failed: {}", id, e.toString());
			}
		}
		Instant warnedBefore = now.minus(WARNING_AHEAD);
		for (UUID id : users.findInactiveIds(deleteSeenBefore, warnedBefore)) {
			try {
				User user = users.findById(id).orElse(null);
				if (user == null || user.isSubscribed(now) || !users.isInactive(id, deleteSeenBefore, warnedBefore)) {
					continue;
				}
				accounts.delete(id);
				deleted++;
			}
			catch (RuntimeException e) {
				failed++;
				log.warn("job=inactive-accounts user={} deletion failed: {}", id, e.toString());
			}
		}
		return new Tally().add("warned", warned).add("deleted", deleted).add("failed", failed);
	}
}
