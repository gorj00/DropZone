update feed_items
set title = replace(replace(title, 'Cleared checkpoint ', 'Cleared milestone '), 'Reached checkpoint ', 'Reached milestone ')
where title like '%checkpoint %';

update quest_completions set summary = 'Friends verified' where summary = 'Squad verified';

update quest_completions
set summary = replace(summary, 'Squad check · ', 'Friends check · ')
where summary like 'Squad check · %';
