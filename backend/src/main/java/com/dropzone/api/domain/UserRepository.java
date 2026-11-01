package com.dropzone.api.domain;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

	Optional<User> findByEmail(String email);

	@Query("""
			select u from User u where lower(u.email) like :pattern or lower(u.handle) like :pattern or lower(u.displayName) like :pattern
			or lower(cast(u.id as string)) like :pattern
			""")
	Page<User> adminSearch(String pattern, Pageable pageable);

	boolean existsByEmailAndIdNot(String email, UUID id);

	Optional<User> findByGoogleSub(String googleSub);

	Optional<User> findByInviteCode(String inviteCode);

	boolean existsByHandle(String handle);

	boolean existsByHandleAndIdNot(String handle, UUID id);

	boolean existsByInviteCode(String inviteCode);

	List<User> findByIdIn(Collection<UUID> ids);

	@Query("select distinct u.timezone from User u where u.onboarded = true and exists (select t.token from PushToken t where t.userId = u.id)")
	List<String> findPushZones();

	@Query("""
			select u.id from User u where u.onboarded = true and u.timezone in :zones
			and (u.dailyRemindedOn is null or u.dailyRemindedOn <> :day) and exists (select t.token from PushToken t where t.userId = u.id)
			""")
	List<UUID> findDailyReminderIds(Collection<String> zones, LocalDate day);

	@Query("""
			select distinct u.timezone from User u where u.onboarded = true and u.trialRemindedAt is null
			and u.trialEndsAt > :from and u.trialEndsAt <= :to
			""")
	List<String> findTrialEndingZones(Instant from, Instant to);

	@Query("""
			select u.id from User u where u.onboarded = true and u.trialRemindedAt is null
			and u.trialEndsAt > :from and u.trialEndsAt <= :to and u.timezone in :zones
			""")
	List<UUID> findTrialEndingIds(Instant from, Instant to, Collection<String> zones);

	@Query("""
			select distinct u.timezone from User u where u.onboarded = true and u.trialEndedNotifiedAt is null
			and u.trialEndsAt > :from and u.trialEndsAt <= :to and u.trialEndAckAt is null and u.pro = false and u.proEndedAt is null
			""")
	List<String> findTrialEndedZones(Instant from, Instant to);

	@Query("""
			select u.id from User u where u.onboarded = true and u.trialEndedNotifiedAt is null
			and u.trialEndsAt > :from and u.trialEndsAt <= :to and u.trialEndAckAt is null and u.pro = false and u.proEndedAt is null
			and u.timezone in :zones
			""")
	List<UUID> findTrialEndedIds(Instant from, Instant to, Collection<String> zones);

	@Modifying
	@Query(value = "update users set daily_reminded_on = :day where id = :id and daily_reminded_on is distinct from :day", nativeQuery = true)
	int claimDailyReminder(UUID id, LocalDate day);

	@Modifying
	@Query(value = "update users set trial_reminded_at = :now where id = :id and trial_reminded_at is null", nativeQuery = true)
	int claimTrialReminder(UUID id, Instant now);

	@Modifying
	@Query(value = "update users set trial_ended_notified_at = :now where id = :id and trial_ended_notified_at is null", nativeQuery = true)
	int claimTrialEnded(UUID id, Instant now);

	@Modifying
	@Query(value = "update users set pro_refreshed_at = :now where id = :id and (pro_refreshed_at is null or pro_refreshed_at < :before)", nativeQuery = true)
	int claimProRefresh(UUID id, Instant now, Instant before);

	@Query("select u.id from User u where u.proExpiresAt >= :from and u.proExpiresAt <= :to")
	List<UUID> findProExpiringBetween(Instant from, Instant to);

	@Query("""
			select u from User u where u.id <> :me and u.suspendedAt is null and u.hiddenFromSearch = false
			and (lower(u.handle) like :handlePrefix or lower(u.displayName) = :name)
			order by case when lower(u.handle) = :handle then 0 when lower(u.handle) like :handlePrefix then 1 else 2 end, u.handle
			""")
	List<User> search(UUID me, String handle, String handlePrefix, String name, Pageable pageable);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id")
	Optional<User> findForUpdate(UUID id);

	@Modifying
	@Query(value = "update users set streak = :streak, best_streak = greatest(best_streak, :best) where id = :id", nativeQuery = true)
	int updateStreak(UUID id, int streak, int best);

	@Query("select u.tokenVersion from User u where u.id = :id")
	Optional<Integer> findTokenVersion(UUID id);

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update User u set u.tokenVersion = u.tokenVersion + 1 where u.id = :id")
	int bumpTokenVersion(UUID id);

	List<User> findByEmailIn(Collection<String> emails);

	@Query("select u.id from User u where u.suspendedAt is not null")
	List<UUID> findSuspendedIds();

	@Query("select count(u) > 0 from User u where u.id = :id and u.suspendedAt is not null")
	boolean isSuspended(UUID id);

	@Modifying
	@Query(value = "update users set moderation_strikes = moderation_strikes + 1 where id = :id", nativeQuery = true)
	int addStrike(UUID id);

	@Modifying
	@Query(value = "update users set suspended_at = :now where id = :id and suspended_at is null and moderation_strikes >= :strikes",
			nativeQuery = true)
	int suspendAtStrikes(UUID id, int strikes, Instant now);

	@Modifying
	@Query(value = """
			insert into verify_push_claims (user_id, pushed_at) values (:id, :now)
			on conflict (user_id) do update set pushed_at = excluded.pushed_at where verify_push_claims.pushed_at <= :before
			""", nativeQuery = true)
	int claimVerifyPush(UUID id, Instant now, Instant before);

	@Modifying
	@Query(value = """
			insert into comment_push_claims (user_id, feed_item_id, pushed_at) values (:id, :feedItemId, :now)
			on conflict (user_id, feed_item_id) do update set pushed_at = excluded.pushed_at where comment_push_claims.pushed_at <= :before
			""", nativeQuery = true)
	int claimCommentPush(UUID id, UUID feedItemId, Instant now, Instant before);

	@Modifying
	@Query(value = "update users set last_seen_at = :now where id = :id and (last_seen_at is null or last_seen_at < :before)", nativeQuery = true)
	int touchLastSeen(UUID id, Instant now, Instant before);

	@Query(value = """
			select id from users where coalesce(last_seen_at, created_at) <= :seenBefore
			and (deletion_warned_at is null or deletion_warned_at < coalesce(last_seen_at, created_at))
			""", nativeQuery = true)
	List<UUID> findDeletionWarningIds(Instant seenBefore);

	@Modifying
	@Query(value = """
			update users set deletion_warned_at = :now where id = :id and coalesce(last_seen_at, created_at) <= :seenBefore
			and (deletion_warned_at is null or deletion_warned_at < coalesce(last_seen_at, created_at))
			""", nativeQuery = true)
	int claimDeletionWarning(UUID id, Instant now, Instant seenBefore);

	@Query(value = """
			select id from users where coalesce(last_seen_at, created_at) <= :seenBefore
			and deletion_warned_at >= coalesce(last_seen_at, created_at) and deletion_warned_at <= :warnedBefore
			""", nativeQuery = true)
	List<UUID> findInactiveIds(Instant seenBefore, Instant warnedBefore);

	@Query(value = """
			select count(*) > 0 from users where id = :id and coalesce(last_seen_at, created_at) <= :seenBefore
			and deletion_warned_at >= coalesce(last_seen_at, created_at) and deletion_warned_at <= :warnedBefore
			""", nativeQuery = true)
	boolean isInactive(UUID id, Instant seenBefore, Instant warnedBefore);
}
