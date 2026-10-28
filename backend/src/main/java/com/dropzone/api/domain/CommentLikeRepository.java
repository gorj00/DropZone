package com.dropzone.api.domain;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CommentLikeRepository extends JpaRepository<CommentLike, CommentLike.Key> {

	long countByCommentId(UUID commentId);

	List<CommentLike> findByUserIdAndCommentIdIn(UUID userId, Collection<UUID> commentIds);

	@Query("select l.commentId, count(l) from CommentLike l where l.commentId in :ids group by l.commentId")
	List<Object[]> countByCommentIds(Collection<UUID> ids);

	List<CommentLike> findByUserIdOrderByCreatedAtAsc(UUID userId);
}
