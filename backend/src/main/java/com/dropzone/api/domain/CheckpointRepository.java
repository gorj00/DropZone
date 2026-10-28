package com.dropzone.api.domain;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface CheckpointRepository extends JpaRepository<Checkpoint, UUID> {

	List<Checkpoint> findByGoalIdOrderByIndexAsc(UUID goalId);

	List<Checkpoint> findByGoalIdInOrderByIndexAsc(Collection<UUID> goalIds);

	List<Checkpoint> findByGoalIdInAndIndexAndVisibilityIn(Collection<UUID> goalIds, int index, Collection<PostVisibility> visibilities);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Checkpoint c where c.id = :id")
	Optional<Checkpoint> findForUpdate(UUID id);

	@Query(value = """
			select c.id from checkpoints c join goals g on g.id = c.goal_id join users u on u.id = g.user_id
			where g.active and c.deadline between :from and :to and c.status in ('ACTIVE', 'LOCKED')
			and c.deadline_reminded_for is distinct from c.deadline
			and u.onboarded and u.suspended_at is null and exists (select 1 from push_tokens t where t.user_id = u.id)
			""", nativeQuery = true)
	List<UUID> findDeadlineReminderIds(LocalDate from, LocalDate to);

	@Modifying
	@Query(value = "update checkpoints set deadline_reminded_for = deadline where id = :id and deadline_reminded_for is distinct from deadline",
			nativeQuery = true)
	int claimDeadlineReminder(UUID id);
}
