alter table users
    add column reminder_pushes boolean not null default true,
    add column deadline_pushes boolean not null default true,
    add column hype_pushes boolean not null default true,
    add column friend_pushes boolean not null default true,
    add column proof_result_pushes boolean not null default true;
