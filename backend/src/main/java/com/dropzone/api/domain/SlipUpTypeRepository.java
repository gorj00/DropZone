package com.dropzone.api.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SlipUpTypeRepository extends JpaRepository<SlipUpType, String> {

	List<SlipUpType> findByUserIdIsNullAndActiveTrueOrderBySortAsc();

	List<SlipUpType> findByUserIdAndActiveTrueOrderBySortAsc(UUID userId);

	Optional<SlipUpType> findByCodeAndUserIdAndActiveTrue(String code, UUID userId);

	List<SlipUpType> findByUserIdOrderBySortAsc(UUID userId);
}
