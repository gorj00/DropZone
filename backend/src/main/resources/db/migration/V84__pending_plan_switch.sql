alter table users add column pending_product_id varchar(64);
alter table users add column pending_switch_at timestamptz;
