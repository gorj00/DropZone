alter table users add column hidden_from_search boolean not null default false;
alter table users add column hidden_from_leaderboards boolean not null default false;
alter table users add column verify_request_pushes boolean not null default true;

create table verify_push_claims (
    user_id uuid primary key references users(id) on delete cascade,
    pushed_at timestamptz not null
);

create index users_handle_prefix_idx on users (lower(handle) text_pattern_ops);
create index users_display_name_lower_idx on users (lower(display_name));
