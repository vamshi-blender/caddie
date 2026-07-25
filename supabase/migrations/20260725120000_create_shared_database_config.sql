begin;

create table public.application_database_config (
  id smallint primary key default 1,
  encrypted_config text not null,
  config_version uuid not null default gen_random_uuid(),
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_database_config_singleton_check check (id = 1),
  constraint application_database_config_ciphertext_check
    check (char_length(encrypted_config) >= 32)
);

create table public.database_query_audit (
  id bigint generated always as identity primary key,
  user_id uuid references public.app_users(id) on delete set null,
  conversation_id text not null,
  config_version uuid not null,
  sql_hash text not null,
  referenced_objects text[] not null default '{}',
  duration_ms integer not null,
  row_count integer not null default 0,
  outcome text not null,
  error_code text,
  created_at timestamptz not null default now(),
  constraint database_query_audit_duration_check check (duration_ms >= 0),
  constraint database_query_audit_row_count_check check (row_count >= 0),
  constraint database_query_audit_outcome_check
    check (outcome in ('succeeded', 'blocked', 'failed', 'timed_out'))
);

create index database_query_audit_created_idx
  on public.database_query_audit (created_at desc);

create index database_query_audit_user_created_idx
  on public.database_query_audit (user_id, created_at desc);

-- These tables are server-only. The application uses the Supabase secret key;
-- no browser-facing policies are created.
alter table public.application_database_config enable row level security;
alter table public.database_query_audit enable row level security;

commit;
