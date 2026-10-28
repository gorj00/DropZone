alter table quest_types add column default_days varchar(32) not null default '1,2,3,4,5,6,7';
alter table quest_types add column default_per_day int not null default 1;
update quest_types set default_days = '1' where code = 'WEIGH_IN';
update quest_types set default_per_day = 3 where multi_slot;
