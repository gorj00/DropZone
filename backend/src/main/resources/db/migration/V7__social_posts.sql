create table transformations (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    before_url varchar(1024) not null,
    after_url varchar(1024) not null,
    before_caption varchar(160),
    after_caption varchar(160),
    layout varchar(12) not null default 'SPLIT',
    visibility varchar(12) not null default 'PRIVATE',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index transformations_user_idx on transformations(user_id, created_at desc);

alter table feed_items add column transformation_id uuid references transformations(id) on delete cascade;
alter table feed_items add column hidden boolean not null default false;
alter table feed_items add column reviewed boolean not null default false;
create unique index feed_items_transformation_idx on feed_items(transformation_id) where transformation_id is not null;

create table comments (
    id uuid primary key,
    feed_item_id uuid not null references feed_items(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    body varchar(500) not null,
    hidden boolean not null default false,
    reviewed boolean not null default false,
    created_at timestamptz not null default now()
);
create index comments_item_idx on comments(feed_item_id, created_at);

create table notifications (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    type varchar(24) not null,
    actor_id uuid references users(id) on delete cascade,
    feed_item_id uuid references feed_items(id) on delete cascade,
    proof_id uuid references proofs(id) on delete cascade,
    comment_id uuid references comments(id) on delete cascade,
    text varchar(200),
    read_at timestamptz,
    created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table reports (
    id uuid primary key,
    reporter_id uuid not null references users(id) on delete cascade,
    target_type varchar(12) not null,
    target_id uuid not null,
    reason varchar(280),
    created_at timestamptz not null default now(),
    unique (reporter_id, target_type, target_id)
);
create index reports_target_idx on reports(target_type, target_id);

create table blocks (
    blocker_id uuid not null references users(id) on delete cascade,
    blocked_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id)
);
create index blocks_blocked_idx on blocks(blocked_id);
