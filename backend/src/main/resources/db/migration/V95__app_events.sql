create table app_events (
    id uuid primary key,
    at timestamptz not null,
    device_id uuid not null,
    name varchar(32) not null,
    detail varchar(300),
    platform varchar(8) not null,
    app_version varchar(32)
);
create index app_events_at_idx on app_events (at desc);
create index app_events_name_at_idx on app_events (name, at desc);
