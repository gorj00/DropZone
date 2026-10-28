package com.dropzone.api.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserQuestRepository extends JpaRepository<UserQuest, UUID> {

	List<UserQuest> findByUserIdAndActiveTrueOrderBySortAscCreatedAtAsc(UUID userId);

	Optional<UserQuest> findByIdAndUserId(UUID id, UUID userId);

	Optional<UserQuest> findFirstByUserIdAndCodeAndActiveTrue(UUID userId, String code);

	List<UserQuest> findByUserIdAndCode(UUID userId, String code);

	@Modifying(flushAutomatically = true)
	@Query("update UserQuest q set q.active = false where q.userId = :userId and q.autoFree = true and q.active = true")
	int deactivateAutoFree(UUID userId);

	List<UserQuest> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
