package com.dropzone.api.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WeighInRepository extends JpaRepository<WeighIn, UUID> {

	Optional<WeighIn> findByUserIdAndDay(UUID userId, LocalDate day);

	boolean existsByUserIdAndDay(UUID userId, LocalDate day);

	List<WeighIn> findByUserIdAndDayBetweenOrderByDayAsc(UUID userId, LocalDate from, LocalDate to);

	List<WeighIn> findByUserIdOrderByDayAsc(UUID userId);
}
