create table push_tokens (
    token varchar(512) primary key,
    user_id uuid not null references users(id) on delete cascade,
    platform varchar(16) not null default 'ANDROID',
    updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens (user_id);

insert into push_tokens (token, user_id, platform, updated_at)
select distinct on (push_token) push_token, id, 'ANDROID', now()
from users where push_token is not null and push_token <> ''
order by push_token, created_at desc;

update users set push_token = null where push_token is not null;
