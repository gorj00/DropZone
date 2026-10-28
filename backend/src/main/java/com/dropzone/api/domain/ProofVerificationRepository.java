package com.dropzone.api.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProofVerificationRepository extends JpaRepository<ProofVerification, ProofVerification.Key> {

	boolean existsByProofIdAndUserId(UUID proofId, UUID userId);

	long countByProofId(UUID proofId);

	List<ProofVerification> findByProofIdOrderByCreatedAtAsc(UUID proofId);

	List<ProofVerification> findByUserIdAndProofIdIn(UUID userId, Collection<UUID> proofIds);
}
