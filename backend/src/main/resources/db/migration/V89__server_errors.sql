create table server_errors (
    id uuid primary key,
    at timestamptz not null,
    method varchar(8) not null,
    path varchar(512) not null,
    exception varchar(120) not null,
    message varchar(300),
    user_id uuid,
    revision varchar(64)
);
create index server_errors_at_idx on server_errors (at desc);
