alter table user_quests add column per_day int not null default 1;

alter table quest_completions add column slot int not null default 1;
alter table quest_completions drop constraint quest_completions_user_quest_id_day_key;
alter table quest_completions add constraint quest_completions_quest_day_slot_key unique (user_quest_id, day, slot);
