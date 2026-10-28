package com.dropzone.api.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MeasurementRepository extends JpaRepository<Measurement, UUID> {

	List<Measurement> findByUserIdInAndMetricAndDayLessThanEqualOrderByDayAscCreatedAtAsc(Collection<UUID> userIds, Metric metric, LocalDate to);

	List<Measurement> findByUserIdAndMetricAndDayBetween(UUID userId, Metric metric, LocalDate from, LocalDate to);

	Optional<Measurement> findFirstByUserIdAndMetricOrderByDayDescCreatedAtDesc(UUID userId, Metric metric);

	Optional<Measurement> findFirstByUserIdAndMetricOrderByValueDesc(UUID userId, Metric metric);

	List<Measurement> findByUserIdAndMetricOrderByDayDescCreatedAtDesc(UUID userId, Metric metric, Pageable pageable);

	Optional<Measurement> findByIdAndUserId(UUID id, UUID userId);

	@Modifying
	@Query(value = """
			insert into measurements (id, user_id, metric, day, value, created_at) values (:id, :userId, 'WEIGHT', :day, :value, :createdAt)
			on conflict (user_id, day) where metric = 'WEIGHT' do update set value = excluded.value, created_at = excluded.created_at
			""", nativeQuery = true)
	int upsertWeight(UUID id, UUID userId, LocalDate day, double value, Instant createdAt);

	@Modifying
	@Query(value = "delete from measurements where user_id = :userId and metric = 'WEIGHT' and day = :day", nativeQuery = true)
	int deleteWeight(UUID userId, LocalDate day);

	List<Measurement> findByUserIdOrderByDayAscCreatedAtAsc(UUID userId);
}
