alter table users
    add column review_prompted_at timestamptz,
    add column feed_filter varchar(8);
