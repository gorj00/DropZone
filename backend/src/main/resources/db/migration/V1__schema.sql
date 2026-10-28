create table users (
    id uuid primary key,
    email varchar(320) not null unique,
    google_sub varchar(255) unique,
    display_name varchar(80) not null,
    handle varchar(30) not null unique,
    avatar_url varchar(1024),
    theme varchar(16) not null default 'NEON',
    path varchar(8),
    pro boolean not null default false,
    pro_expires_at timestamptz,
    unlock_mode varchar(16) not null default 'WHOLE_DAY',
    minutes_per_quest int not null default 30,
    public_by_default boolean not null default false,
    default_verification varchar(16) not null default 'AI',
    slip_up_tracking boolean not null default true,
    onboarded boolean not null default false,
    streak int not null default 0,
    best_streak int not null default 0,
    invite_code varchar(16) not null unique,
    push_token varchar(512),
    timezone varchar(64) not null default 'UTC',
    created_at timestamptz not null default now()
);

create table user_locked_apps (
    user_id uuid not null references users(id) on delete cascade,
    package_name varchar(255) not null,
    primary key (user_id, package_name)
);

create table goals (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    path varchar(8) not null,
    metric varchar(16) not null,
    metric_label varchar(60),
    unit varchar(4) not null,
    start_value double precision not null,
    goal_value double precision not null,
    current_value double precision not null,
    active boolean not null default true,
    created_at timestamptz not null default now()
);
create index goals_user_idx on goals(user_id, active);

create table proofs (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    kind varchar(16) not null,
    ref_id uuid not null,
    photo_url varchar(1024),
    value double precision,
    ml_labels text,
    ml_text text,
    status varchar(16) not null,
    required_verifications int not null default 0,
    verified_count int not null default 0,
    is_public boolean not null default false,
    created_at timestamptz not null default now()
);
create index proofs_user_idx on proofs(user_id);
create index proofs_status_idx on proofs(status, is_public);

create table proof_verifications (
    proof_id uuid not null references proofs(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (proof_id, user_id)
);

create table checkpoints (
    id uuid primary key,
    goal_id uuid not null references goals(id) on delete cascade,
    idx int not null,
    target_value double precision not null,
    reward_title varchar(80),
    reward_image_url varchar(1024),
    is_public boolean not null default false,
    verification varchar(16) not null default 'AI',
    deadline date,
    status varchar(24) not null,
    cleared_at timestamptz,
    proof_id uuid references proofs(id) on delete set null,
    unique (goal_id, idx)
);

create table quest_types (
    id serial primary key,
    path varchar(8) not null,
    code varchar(32) not null,
    name varchar(60) not null,
    icon varchar(32) not null,
    grp varchar(16) not null,
    proof varchar(16) not null,
    free boolean not null default false,
    auto_source varchar(16),
    target int,
    sort int not null default 0,
    unique (path, code)
);

create table user_quests (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    quest_type_id int references quest_types(id),
    code varchar(32),
    name varchar(60) not null,
    icon varchar(32) not null,
    grp varchar(16) not null,
    proof varchar(16) not null,
    auto_source varchar(16),
    target int,
    custom boolean not null default false,
    days varchar(32) not null default '1,2,3,4,5,6,7',
    squad_check boolean not null default false,
    active boolean not null default true,
    sort int not null default 0,
    created_at timestamptz not null default now()
);
create index user_quests_user_idx on user_quests(user_id, active);

create table quest_completions (
    id uuid primary key,
    user_quest_id uuid not null references user_quests(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    day date not null,
    status varchar(16) not null,
    value double precision,
    reps int,
    proof_id uuid references proofs(id) on delete set null,
    summary varchar(120),
    created_at timestamptz not null default now(),
    unique (user_quest_id, day)
);
create index quest_completions_user_day_idx on quest_completions(user_id, day);

create table daily_results (
    user_id uuid not null references users(id) on delete cascade,
    day date not null,
    done_count int not null,
    total_count int not null,
    primary key (user_id, day)
);

create table measurements (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    metric varchar(16) not null,
    day date not null,
    value double precision not null,
    created_at timestamptz not null default now()
);
create index measurements_user_idx on measurements(user_id, metric, day);

create table weigh_ins (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    day date not null,
    value double precision not null,
    photo_url varchar(1024),
    ml_text text,
    created_at timestamptz not null default now(),
    unique (user_id, day)
);

create table feed_items (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    type varchar(24) not null,
    proof_id uuid references proofs(id) on delete cascade,
    checkpoint_id uuid references checkpoints(id) on delete cascade,
    photo_url varchar(1024),
    title varchar(120) not null,
    subtitle varchar(160),
    delta_value double precision,
    unit varchar(4),
    is_public boolean not null default false,
    created_at timestamptz not null default now()
);
create index feed_items_created_idx on feed_items(created_at desc);
create index feed_items_user_idx on feed_items(user_id, created_at desc);

create table hypes (
    feed_item_id uuid not null references feed_items(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (feed_item_id, user_id)
);

create table friend_requests (
    id uuid primary key,
    from_user_id uuid not null references users(id) on delete cascade,
    to_user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (from_user_id, to_user_id)
);

create table friendships (
    user_id uuid not null references users(id) on delete cascade,
    friend_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, friend_id)
);

create table slip_up_types (
    code varchar(32) primary key,
    name varchar(60) not null,
    icon varchar(32) not null,
    sort int not null default 0
);

create table slip_ups (
    id uuid primary key,
    user_id uuid not null references users(id) on delete cascade,
    type varchar(32) not null references slip_up_types(code),
    occurred_at timestamptz not null,
    note varchar(280),
    created_at timestamptz not null default now()
);
create index slip_ups_user_idx on slip_ups(user_id, occurred_at);
