update user_quests q set active = false
where q.active and not q.custom and q.code is not null and exists (
    select 1 from user_quests older
    where older.user_id = q.user_id and older.code = q.code and older.active and not older.custom
      and (older.created_at < q.created_at or (older.created_at = q.created_at and older.id < q.id))
);
create unique index user_quests_active_code_idx on user_quests (user_id, code) where active and not custom;
update user_quests set squad_check = false where squad_check and proof <> 'PHOTO';
