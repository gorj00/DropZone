package com.dropzone.api.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SlipUpRepository extends JpaRepository<SlipUp, UUID> {

	List<SlipUp> findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(UUID userId, Instant from, Instant to);

	List<SlipUp> findByUserIdOrderByOccurredAtAsc(UUID userId);
}
