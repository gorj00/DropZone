package com.dropzone.api.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BlockRepository extends JpaRepository<Block, Block.Key> {

	List<Block> findByBlockerIdOrBlockedId(UUID blockerId, UUID blockedId);

	List<Block> findByBlockerIdOrderByCreatedAtDesc(UUID blockerId);
}
