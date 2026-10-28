alter table users add column token_version int not null default 0;
alter table users add column terms_version varchar(32);
alter table users add column privacy_version varchar(32);
alter table users add column terms_accepted_at timestamptz;
