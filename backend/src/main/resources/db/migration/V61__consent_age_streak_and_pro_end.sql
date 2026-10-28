alter table users add column age_confirmed_at timestamptz;
alter table users add column skip_rest_days boolean not null default false;

alter table daily_results add column pro_cleared_at timestamptz;

alter table user_quests add column starts_on date;
