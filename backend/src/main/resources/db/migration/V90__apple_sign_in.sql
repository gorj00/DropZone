alter table users add column apple_sub varchar(255);
create unique index users_apple_sub_idx on users (apple_sub);
