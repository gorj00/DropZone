package com.dropzone.api.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestCompletionRepository extends JpaRepository<QuestCompletion, UUID> {

	List<QuestCompletion> findByUserIdAndDay(UUID userId, LocalDate day);

	Optional<QuestCompletion> findByUserQuestIdAndDayAndSlot(UUID userQuestId, LocalDate day, int slot);

	List<QuestCompletion> findByUserQuestIdAndDay(UUID userQuestId, LocalDate day);

	Optional<QuestCompletion> findByProofId(UUID proofId);

	List<QuestCompletion> findByUserIdOrderByDayAscCreatedAtAsc(UUID userId);

	List<QuestCompletion> findByUserIdAndDayBetweenOrderByCreatedAtAsc(UUID userId, LocalDate from, LocalDate to);
}
