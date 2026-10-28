package com.dropzone.api.user;

import com.dropzone.api.billing.RevenueCatClient;
import com.dropzone.api.domain.UserRepository;
import com.dropzone.api.storage.StorageService;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AccountService {

	private static final Logger log = LoggerFactory.getLogger(AccountService.class);

	private final UserService userService;
	private final UserRepository users;
	private final StorageService storage;
	private final RevenueCatClient revenueCat;
	private final TransactionTemplate tx;

	public AccountService(UserService userService, UserRepository users, StorageService storage, RevenueCatClient revenueCat,
			TransactionTemplate tx) {
		this.userService = userService;
		this.users = users;
		this.storage = storage;
		this.revenueCat = revenueCat;
		this.tx = tx;
	}

	public void delete(UUID userId) {
		userService.get(userId);
		storage.deletePrefix("uploads/" + userId + "/");
		revenueCat.deleteSubscriber(userId.toString());
		tx.executeWithoutResult(status -> {
			users.bumpTokenVersion(userId);
			users.deleteById(userId);
		});
		log.info("Deleted account {}", userId);
	}
}
