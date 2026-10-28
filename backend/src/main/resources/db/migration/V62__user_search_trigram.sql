do $$
begin
    if not exists (select 1 from pg_extension where extname = 'pg_trgm')
            and exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
        begin
            create extension if not exists pg_trgm;
        exception when others then
            raise notice 'pg_trgm was not created (%), user search runs without trigram indexes', sqlerrm;
        end;
    end if;
    if exists (select 1 from pg_extension where extname = 'pg_trgm') then
        execute 'create index if not exists users_handle_trgm_idx on users using gin (lower(handle) gin_trgm_ops)';
        execute 'create index if not exists users_display_name_trgm_idx on users using gin (lower(display_name) gin_trgm_ops)';
    else
        raise notice 'pg_trgm is not available, user search runs without trigram indexes';
    end if;
end
$$;
