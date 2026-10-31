package com.dropzone.api.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FeedItemRepository extends JpaRepository<FeedItem, UUID> {

	String PRO_AUTHOR = """
			exists (select 1 from users a where a.id = f.user_id and ((a.trial_ends_at is not null and a.trial_ends_at > :now)
			or (a.pro and (a.pro_expires_at is null or a.pro_expires_at > :now or (a.will_renew and a.pro_expires_at > :renewing)))))
			""";

	@Query(value = """
			select f.* from feed_items f
			where f.user_id in (:authors) and f.user_id not in (:hidden) and (f.hidden = false or f.user_id = :me)
			and (f.user_id = :me or\s""" + PRO_AUTHOR + """
			) and (f.created_at < :at or (f.created_at = :at and f.id < :id))
			order by f.created_at desc, f.id desc limit :limit
			""", nativeQuery = true)
	List<FeedItem> friendsPage(UUID me, Collection<UUID> authors, Collection<UUID> hidden, Instant now, Instant renewing, Instant at, UUID id,
			int limit);

	@Query(value = """
			select f.* from feed_items f
			where f.user_id = :author and f.user_id not in (:hidden) and (f.hidden = false or f.user_id = :me)
			and (f.is_public = true or f.user_id = :me or :friend = true)
			and (f.user_id = :me or\s""" + PRO_AUTHOR + """
			) and (f.created_at < :at or (f.created_at = :at and f.id < :id))
			order by f.created_at desc, f.id desc limit :limit
			""", nativeQuery = true)
	List<FeedItem> authorPage(UUID me, UUID author, boolean friend, Collection<UUID> hidden, Instant now, Instant renewing, Instant at,
			UUID id, int limit);

	@Query(value = """
			select f.* from feed_items f
			where f.is_public = true and f.user_id not in (:hidden) and (f.hidden = false or f.user_id = :me)
			and (f.user_id = :me or\s""" + PRO_AUTHOR + """
			) and (f.created_at < :at or (f.created_at = :at and f.id < :id))
			order by f.created_at desc, f.id desc limit :limit
			""", nativeQuery = true)
	List<FeedItem> everyonePage(UUID me, Collection<UUID> hidden, Instant now, Instant renewing, Instant at, UUID id, int limit);

	@Query(value = """
			select f.* from feed_items f join proofs p on p.id = f.proof_id
			where p.status = 'PENDING' and p.required_verifications > 0 and p.user_id <> :me
			and f.user_id not in (:hidden) and f.hidden = false and\s""" + PRO_AUTHOR + """
			and ((f.is_public = true and p.is_public = true) or f.user_id in (:friends))
			and not exists (select 1 from proof_verifications v where v.proof_id = p.id and v.user_id = :me)
			and (f.created_at < :at or (f.created_at = :at and f.id < :id))
			order by f.created_at desc, f.id desc limit :limit
			""", nativeQuery = true)
	List<FeedItem> toVerifyPage(UUID me, Collection<UUID> friends, Collection<UUID> hidden, Instant now, Instant renewing, Instant at,
			UUID id, int limit);

	@Query(value = """
			select count(distinct p.id) from feed_items f join proofs p on p.id = f.proof_id
			where p.status = 'PENDING' and p.required_verifications > 0 and p.user_id <> :me
			and f.user_id not in (:hidden) and f.hidden = false and\s""" + PRO_AUTHOR + """
			and ((f.is_public = true and p.is_public = true) or f.user_id in (:friends))
			and not exists (select 1 from proof_verifications v where v.proof_id = p.id and v.user_id = :me)
			""", nativeQuery = true)
	long countToVerify(UUID me, Collection<UUID> friends, Collection<UUID> hidden, Instant now, Instant renewing);

	@Query(value = """
			select count(distinct p.id) from feed_items f join proofs p on p.id = f.proof_id
			where p.status = 'PENDING' and p.required_verifications > 0 and p.user_id <> :me
			and f.user_id in (:friends) and f.user_id not in (:hidden) and f.hidden = false and\s""" + PRO_AUTHOR + """
			and not exists (select 1 from proof_verifications v where v.proof_id = p.id and v.user_id = :me)
			""", nativeQuery = true)
	long countFriendsToVerify(UUID me, Collection<UUID> friends, Collection<UUID> hidden, Instant now, Instant renewing);

	Optional<FeedItem> findFirstByProofIdOrderByCreatedAtAsc(UUID proofId);

	List<FeedItem> findByProofId(UUID proofId);

	List<FeedItem> findByProofIdIn(Collection<UUID> proofIds);

	List<FeedItem> findByCheckpointId(UUID checkpointId);

	boolean existsByCheckpointIdAndHiddenTrue(UUID checkpointId);

	boolean existsByProofIdAndHiddenTrue(UUID proofId);

	@Query("select distinct f.checkpointId from FeedItem f where f.checkpointId in :ids and f.hidden = true")
	List<UUID> findHiddenCheckpointIds(Collection<UUID> ids);

	Optional<FeedItem> findByTransformationId(UUID transformationId);

	List<FeedItem> findByTransformationIdIn(Collection<UUID> transformationIds);

	List<FeedItem> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
