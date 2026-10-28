package com.dropzone.api.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface HypeRepository extends JpaRepository<Hype, Hype.Key> {

	List<Hype> findByFeedItemIdIn(Collection<UUID> feedItemIds);

	@Modifying
	@Query(value = "insert into hypes (feed_item_id, user_id, created_at) values (:feedItemId, :userId, :at) on conflict do nothing",
			nativeQuery = true)
	int insertIfAbsent(UUID feedItemId, UUID userId, Instant at);

	@Modifying
	@Query("delete from Hype h where h.feedItemId = :feedItemId and h.userId = :userId")
	int remove(UUID feedItemId, UUID userId);

	List<Hype> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
