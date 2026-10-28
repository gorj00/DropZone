package com.dropzone.api.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransformationRepository extends JpaRepository<Transformation, UUID> {

	List<Transformation> findByUserIdOrderByCreatedAtDesc(UUID userId);
}
