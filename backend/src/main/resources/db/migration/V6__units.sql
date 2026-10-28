alter table users add column weight_unit varchar(8) not null default 'KG';
alter table users add column length_unit varchar(8) not null default 'CM';

alter table feed_items add column quest_value double precision;

update feed_items
set quest_value = cast(substring(subtitle from '^([0-9]+(\.[0-9]+)?) kg') as double precision),
    unit = 'kg',
    subtitle = nullif(regexp_replace(subtitle, '^[0-9]+(\.[0-9]+)? kg( · )?', ''), '')
where type = 'QUEST_PROOF' and subtitle ~ '^[0-9]+(\.[0-9]+)? kg';

update quest_completions
set summary = nullif(regexp_replace(summary, '^[0-9]+(\.[0-9]+)? kg( · )?', ''), '')
where summary ~ '^[0-9]+(\.[0-9]+)? kg';
