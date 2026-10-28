alter table checkpoints add column visibility varchar(16) not null default 'PRIVATE';

update checkpoints set visibility = case when is_public then 'EVERYONE' when verification = 'COMMUNITY' then 'FRIENDS' else 'PRIVATE' end;
