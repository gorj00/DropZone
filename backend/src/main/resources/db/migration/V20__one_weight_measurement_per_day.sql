delete from measurements m
where m.metric = 'WEIGHT' and exists (
    select 1 from measurements newer
    where newer.user_id = m.user_id and newer.metric = 'WEIGHT' and newer.day = m.day
      and (newer.created_at > m.created_at or (newer.created_at = m.created_at and newer.id > m.id))
);
update measurements m set value = w.value
from weigh_ins w
where m.metric = 'WEIGHT' and w.user_id = m.user_id and w.day = m.day and m.value <> w.value;
create unique index measurements_weight_day_idx on measurements (user_id, day) where metric = 'WEIGHT';
