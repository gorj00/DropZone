package com.dropzone.api.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

	List<Comment> findByFeedItemIdOrderByCreatedAtAsc(UUID feedItemId);

	@Query("""
			select c.feedItemId, count(c) from Comment c where c.feedItemId in :ids and c.hidden = false and c.userId not in :hidden
			group by c.feedItemId
			""")
	List<Object[]> countVisibleByFeedItemIds(Collection<UUID> ids, Collection<UUID> hidden);

	List<Comment> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
