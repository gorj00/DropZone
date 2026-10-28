package com.dropzone.api.domain;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestTypeRepository extends JpaRepository<QuestType, Integer> {

	List<QuestType> findAllByOrderByPathAscSortAsc();

	List<QuestType> findByPathOrderBySortAsc(Path path);

	Optional<QuestType> findByPathAndCode(Path path, String code);
}
