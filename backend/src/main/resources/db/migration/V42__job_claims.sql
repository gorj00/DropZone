alter table users add column daily_reminded_on date;
alter table users add column trial_ended_notified_at timestamptz;
create index users_trial_reminder_idx on users (trial_ends_at) where trial_reminded_at is null;
create index users_trial_ended_idx on users (trial_ends_at) where trial_ended_notified_at is null;
