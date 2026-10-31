package com.dropzone.api.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

	@Query(value = """
			select n.* from notifications n
			where n.user_id = :userId and n.retracted = false and (n.actor_id is null or n.actor_id not in (:hidden))
			and (n.created_at < :at or (n.created_at = :at and n.id < :id))
			order by n.created_at desc, n.id desc limit :limit
			""", nativeQuery = true)
	List<Notification> page(UUID userId, Collection<UUID> hidden, Instant at, UUID id, int limit);

	@Query("""
			select count(n) from Notification n where n.userId = :userId and n.readAt is null and n.retracted = false
			and (n.actorId is null or n.actorId not in :hidden)
			""")
	long countUnread(UUID userId, Collection<UUID> hidden);

	@Query("""
			select count(distinct n.actorId) from Notification n where n.userId = :userId and n.feedItemId = :feedItemId
			and n.type in :types and n.readAt is null and n.retracted = false and n.actorId not in :hidden
			""")
	long countUnreadCommenters(UUID userId, UUID feedItemId, Collection<NotificationType> types, Collection<UUID> hidden);

	Optional<Notification> findFirstByTypeAndActorIdAndFeedItemId(NotificationType type, UUID actorId, UUID feedItemId);

	void deleteByTypeAndActorIdAndCommentId(NotificationType type, UUID actorId, UUID commentId);

	void deleteByTypeAndActorIdAndUserId(NotificationType type, UUID actorId, UUID userId);

	@Modifying
	@Query("update Notification n set n.retracted = true where n.type = :type and n.actorId = :actorId and n.feedItemId = :feedItemId")
	int retract(NotificationType type, UUID actorId, UUID feedItemId);

	@Modifying
	@Query("update Notification n set n.readAt = :at where n.userId = :userId and n.readAt is null")
	int markAllRead(UUID userId, Instant at);

	@Modifying
	@Query(value = "delete from notifications where id in (select id from notifications where created_at < :cutoff limit :limit)",
			nativeQuery = true)
	int deleteOlderThan(Instant cutoff, int limit);

	List<Notification> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
