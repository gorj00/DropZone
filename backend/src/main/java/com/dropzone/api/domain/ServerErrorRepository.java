package com.dropzone.api.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ServerErrorRepository extends JpaRepository<ServerError, UUID> {

	List<ServerError> findAllByOrderByAtDesc(Pageable pageable);

	long countByAtGreaterThanEqual(Instant since);

	@Modifying
	@Query("delete from ServerError e where e.at < :before")
	int deleteOlderThan(Instant before);
}
