create table job_runs (
    name varchar(64) primary key,
    last_run_at timestamptz not null,
    failed_at timestamptz,
    error varchar(300)
);
