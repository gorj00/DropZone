alter table users add column comment_pushes boolean not null default true;

create table comment_push_claims (
    user_id uuid not null references users(id) on delete cascade,
    feed_item_id uuid not null references feed_items(id) on delete cascade,
    pushed_at timestamptz not null,
    primary key (user_id, feed_item_id)
);
