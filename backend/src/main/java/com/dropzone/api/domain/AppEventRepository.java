package com.dropzone.api.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AppEventRepository extends JpaRepository<AppEvent, UUID> {

	List<AppEvent> findAllByOrderByAtDesc(Pageable pageable);

	List<AppEvent> findByNameOrderByAtDesc(AppEventName name, Pageable pageable);

	@Modifying
	@Query("delete from AppEvent e where e.at < :before")
	int deleteOlderThan(Instant before);
}
