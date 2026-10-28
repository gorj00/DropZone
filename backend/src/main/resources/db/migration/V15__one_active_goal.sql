update goals g set active = false
where g.active and exists (
    select 1 from goals newer
    where newer.user_id = g.user_id and newer.active
      and (newer.created_at > g.created_at or (newer.created_at = g.created_at and newer.id > g.id))
);
create unique index goals_one_active_idx on goals (user_id) where active;
