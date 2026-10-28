package com.dropzone.api.domain;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface PushTokenRepository extends JpaRepository<PushToken, String> {

	List<PushToken> findByUserId(UUID userId);

	List<PushToken> findByUserIdIn(Collection<UUID> userIds);

	@Modifying
	@Query(value = """
			insert into push_tokens (token, user_id, platform, updated_at) values (:token, :userId, :platform, :now)
			on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at
			""", nativeQuery = true)
	int upsert(String token, UUID userId, String platform, Instant now);

	@Modifying
	@Query("delete from PushToken t where t.token = :token and t.userId = :userId")
	int deleteByTokenAndUserId(String token, UUID userId);

	@Modifying
	@Query("delete from PushToken t where t.userId = :userId")
	int deleteByUserId(UUID userId);

	@Modifying
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	@Query("delete from PushToken t where t.token = :token")
	int deleteDead(String token);
}
