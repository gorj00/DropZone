alter table users add column billing_event_at timestamptz;
alter table users add column billing_issue_at timestamptz;
alter table users add column will_renew boolean not null default false;
alter table users add column pro_product_id varchar(255);
alter table users add column pro_ended_at timestamptz;
alter table users add column pro_end_ack_at timestamptz;
alter table users add column pro_refreshed_at timestamptz;
update users set will_renew = true where pro;
create index users_pro_expires_idx on users (pro_expires_at) where pro_expires_at is not null;

create table billing_events (
    id varchar(128) primary key,
    type varchar(64) not null,
    app_user_id varchar(255),
    environment varchar(32),
    received_at timestamptz not null default now()
);

alter table user_quests add column auto_free boolean not null default false;
