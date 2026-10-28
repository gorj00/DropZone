package com.dropzone.api.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, UUID> {

	List<FriendRequest> findByToUserIdOrderByCreatedAtDesc(UUID toUserId);

	List<FriendRequest> findByFromUserIdOrderByCreatedAtDesc(UUID fromUserId);

	Optional<FriendRequest> findByFromUserIdAndToUserId(UUID fromUserId, UUID toUserId);
}
