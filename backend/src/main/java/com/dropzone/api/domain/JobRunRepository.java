package com.dropzone.api.domain;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRunRepository extends JpaRepository<JobRun, String> {

	List<JobRun> findByFailedAtNotNullOrderByName();
}
