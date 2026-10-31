package com.dropzone.api.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ReportRepository extends JpaRepository<Report, UUID> {

	boolean existsByReporterIdAndTargetTypeAndTargetId(UUID reporterId, ReportTarget targetType, UUID targetId);

	long countByTargetTypeAndTargetId(ReportTarget targetType, UUID targetId);

	@Query("""
			select count(r) from Report r where r.targetType = :targetType and r.targetId = :targetId
			and r.reporterId in (select u.id from User u where u.createdAt <= :joinedBefore)
			""")
	long countFromAccountsJoinedBefore(ReportTarget targetType, UUID targetId, Instant joinedBefore);

	List<Report> findByTargetTypeAndTargetIdOrderByCreatedAtDesc(ReportTarget targetType, UUID targetId);

	List<Report> findAllByOrderByCreatedAtDesc();

	@Query(value = """
			select r.* from reports r
			where (r.target_type = 'USER' and r.target_id = :userId)
			or (r.target_type = 'POST' and r.target_id in (select f.id from feed_items f where f.user_id = :userId))
			or (r.target_type = 'COMMENT' and r.target_id in (select c.id from comments c where c.user_id = :userId))
			order by r.created_at desc
			""", nativeQuery = true)
	List<Report> findAboutUser(UUID userId);

	void deleteByTargetTypeAndTargetId(ReportTarget targetType, UUID targetId);

	@Modifying
	@Query(value = "delete from reports where target_type = 'COMMENT' and target_id in (select c.id from comments c where c.feed_item_id = :feedItemId)",
			nativeQuery = true)
	int deleteCommentReportsOfPost(UUID feedItemId);

	@Modifying
	@Query(value = "delete from reports where target_type = 'COMMENT' and target_id in (select c.id from comments c where c.parent_id = :commentId)",
			nativeQuery = true)
	int deleteReplyReportsOf(UUID commentId);

	List<Report> findByReporterIdOrderByCreatedAtAsc(UUID reporterId);
}
