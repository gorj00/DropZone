alter table slip_up_types add column user_id uuid references users(id) on delete cascade;
alter table slip_up_types add column active boolean not null default true;
create index slip_up_types_user_idx on slip_up_types(user_id);

create index feed_items_checkpoint_idx on feed_items(checkpoint_id);
create index checkpoints_goal_status_idx on checkpoints(goal_id, status);
