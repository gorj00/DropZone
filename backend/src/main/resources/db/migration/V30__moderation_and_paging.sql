alter table users add column suspended_at timestamptz;
alter table users add column moderation_strikes int not null default 0;
create index users_suspended_idx on users (id) where suspended_at is not null;

alter table transformations add column removed_by_moderator boolean not null default false;

alter table notifications add column retracted boolean not null default false;
create index notifications_user_page_idx on notifications (user_id, created_at desc, id desc);

create index feed_items_page_idx on feed_items (created_at desc, id desc);
create index feed_items_user_page_idx on feed_items (user_id, created_at desc, id desc);
