alter table comments add column parent_id uuid references comments(id) on delete cascade;
create index comments_parent_idx on comments (parent_id);
