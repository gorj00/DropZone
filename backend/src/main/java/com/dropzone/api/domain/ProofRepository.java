package com.dropzone.api.domain;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface ProofRepository extends JpaRepository<Proof, UUID> {

	boolean existsByPhotoUrlAndStatusNot(String photoUrl, ProofStatus status);

	List<Proof> findByKindAndRefId(ProofKind kind, UUID refId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Proof p where p.id = :id")
	Optional<Proof> findForUpdate(UUID id);

	List<Proof> findByUserId(UUID userId);
}
