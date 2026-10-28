alter table users add column share_stats boolean not null default false;
alter table users add column share_stats_at timestamptz;
alter table users add column region_source varchar(16);
alter table users add column region_value varchar(64);
alter table users add column region_eu boolean;
alter table users add column region_at timestamptz;
