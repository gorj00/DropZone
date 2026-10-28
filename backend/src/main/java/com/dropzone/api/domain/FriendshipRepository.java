package com.dropzone.api.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendshipRepository extends JpaRepository<Friendship, Friendship.Key> {

	List<Friendship> findByUserId(UUID userId);

	boolean existsByUserIdAndFriendId(UUID userId, UUID friendId);
}
