alter table proofs add column ai_checked boolean not null default false;

update quest_completions set summary = case when proof_id is null then null else 'Photo proof' end where summary = 'AI verified';
update feed_items set subtitle = 'Photo proof' where subtitle = 'AI verified';
