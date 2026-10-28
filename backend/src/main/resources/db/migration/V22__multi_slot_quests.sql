alter table quest_types add column multi_slot boolean not null default false;
update quest_types set multi_slot = true where code in ('HEALTHY_MEAL', 'PROTEIN_MEAL', 'EXTRA_MEAL');
