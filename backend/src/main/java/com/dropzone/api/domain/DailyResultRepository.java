package com.dropzone.api.domain;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DailyResultRepository extends JpaRepository<DailyResult, DailyResult.Key> {

	List<DailyResult> findByUserIdAndDayBetween(UUID userId, LocalDate from, LocalDate to);

	List<DailyResult> findByUserIdInAndDay(Collection<UUID> userIds, LocalDate day);

	List<DailyResult> findByUserIdOrderByDayAsc(UUID userId);

	@Query("select d.day from DailyResult d where d.userId = :userId and d.totalCount > 0 and d.doneCount >= d.totalCount")
	List<LocalDate> completeDays(UUID userId);
}
