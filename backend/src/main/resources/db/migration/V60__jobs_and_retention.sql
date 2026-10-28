alter table users add column last_seen_at timestamptz;
update users set last_seen_at = now();
alter table users add column deletion_warned_at timestamptz;
create index users_last_seen_idx on users (last_seen_at);

alter table checkpoints add column deadline_reminded_for date;
create index checkpoints_deadline_idx on checkpoints (deadline) where deadline is not null;

create index notifications_created_idx on notifications (created_at);
