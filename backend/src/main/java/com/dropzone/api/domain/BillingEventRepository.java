package com.dropzone.api.domain;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface BillingEventRepository extends JpaRepository<BillingEvent, String> {

	@Modifying
	@Query(value = """
			insert into billing_events (id, type, app_user_id, environment, received_at) values (:id, :type, :appUserId, :environment, :now)
			on conflict (id) do nothing
			""", nativeQuery = true)
	int record(String id, String type, String appUserId, String environment, Instant now);

	@Query("select e from BillingEvent e where :sandbox = true or e.environment is null or upper(e.environment) <> 'SANDBOX' order by e.receivedAt desc")
	List<BillingEvent> findLatest(boolean sandbox, Pageable pageable);
}
