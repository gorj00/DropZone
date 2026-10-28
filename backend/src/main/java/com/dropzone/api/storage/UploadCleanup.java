package com.dropzone.api.storage;

import com.dropzone.api.common.Tally;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class UploadCleanup {

	private static final Logger log = LoggerFactory.getLogger(UploadCleanup.class);

	private final StorageService storage;
	private final PhotoUrls urls;
	private final JdbcTemplate jdbc;
	private final Clock clock;

	public UploadCleanup(StorageService storage, PhotoUrls urls, JdbcTemplate jdbc, Clock clock) {
		this.storage = storage;
		this.urls = urls;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	public void deleteIfUnused(String url) {
		String objectName = urls.objectName(url);
		if (objectName == null) {
			return;
		}
		afterCommit(() -> {
			if (!referenced(PhotoUrls.owner(objectName), url)) {
				delete(objectName);
			}
		});
	}

	public void purge(Collection<String> photoUrls) {
		for (String url : new LinkedHashSet<>(photoUrls)) {
			String objectName = urls.objectName(url);
			if (objectName == null) {
				continue;
			}
			jdbc.update("update users set avatar_url = null where avatar_url = ?", url);
			jdbc.update("update proofs set photo_url = null where photo_url = ?", url);
			jdbc.update("update weigh_ins set photo_url = null where photo_url = ?", url);
			jdbc.update("update feed_items set photo_url = null where photo_url = ?", url);
			jdbc.update("update checkpoints set reward_image_url = null where reward_image_url = ?", url);
			afterCommit(() -> delete(objectName));
		}
	}

	private static void afterCommit(Runnable task) {
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override
				public void afterCommit() {
					task.run();
				}
			});
		}
		else {
			task.run();
		}
	}

	public Tally sweep(Duration minAge) {
		Instant cutoff = clock.instant().minus(minAge);
		Set<String> referenced = new HashSet<>(jdbc.queryForList("""
				select avatar_url from users where avatar_url is not null
				union select photo_url from proofs where photo_url is not null
				union select photo_url from weigh_ins where photo_url is not null
				union select photo_url from feed_items where photo_url is not null
				union select reward_image_url from checkpoints where reward_image_url is not null
				union select before_url from transformations
				union select after_url from transformations
				""", String.class));
		int objects = 0;
		int deleted = 0;
		for (StorageService.StoredObject object : storage.list("uploads/")) {
			objects++;
			if (object.createdAt() == null || object.createdAt().isAfter(cutoff) || referenced.contains(storage.publicUrl(object.name()))) {
				continue;
			}
			if (delete(object.name())) {
				deleted++;
			}
		}
		return new Tally().add("objects", objects).add("deleted", deleted);
	}

	private boolean referenced(UUID owner, String url) {
		Integer count = jdbc.queryForObject("""
				select (select count(*) from users where id = ? and avatar_url = ?)
				     + (select count(*) from proofs where user_id = ? and photo_url = ?)
				     + (select count(*) from weigh_ins where user_id = ? and photo_url = ?)
				     + (select count(*) from feed_items where user_id = ? and photo_url = ?)
				     + (select count(*) from transformations where user_id = ? and (before_url = ? or after_url = ?))
				     + (select count(*) from checkpoints c join goals g on g.id = c.goal_id where g.user_id = ? and c.reward_image_url = ?)
				""", Integer.class, owner, url, owner, url, owner, url, owner, url, owner, url, url, owner, url);
		return count != null && count > 0;
	}

	private boolean delete(String objectName) {
		try {
			storage.delete(objectName);
			return true;
		}
		catch (RuntimeException e) {
			log.warn("Could not delete {}: {}", objectName, e.getMessage());
			return false;
		}
	}
}
