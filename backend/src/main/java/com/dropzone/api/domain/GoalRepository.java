package com.dropzone.api.domain;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoalRepository extends JpaRepository<Goal, UUID> {

	Optional<Goal> findFirstByUserIdAndActiveTrueOrderByCreatedAtDesc(UUID userId);

	List<Goal> findByUserIdAndActiveTrue(UUID userId);

	List<Goal> findByUserIdInAndActiveTrue(Collection<UUID> userIds);

	List<Goal> findByUserIdOrderByCreatedAtAsc(UUID userId);

	List<Goal> findByUserIdAndActiveFalseOrderByCreatedAtDesc(UUID userId);
}
