begin;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_key unique (email),
  constraint app_users_email_normalized_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint app_users_password_hash_check
    check (char_length(password_hash) >= 32)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  openai_conversation_id text,
  title text not null default 'New chat',
  title_status text not null default 'fallback',
  is_pinned boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_openai_conversation_id_key
    unique (openai_conversation_id),
  constraint conversations_title_status_check
    check (title_status in ('pending', 'generated', 'fallback', 'manual'))
);

create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_role_check
    check (role in ('user', 'assistant'))
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at, id);

create table public.message_tool_calls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  tool_call_id text not null,
  sequence_number integer not null,
  tool_name text not null,
  executor text not null,
  arguments_json text not null default '{}',
  output_text text,
  status text not null,
  approval_status text not null default 'not_required',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_tool_calls_message_call_key
    unique (message_id, tool_call_id),
  constraint message_tool_calls_message_sequence_key
    unique (message_id, sequence_number),
  constraint message_tool_calls_sequence_check
    check (sequence_number >= 0),
  constraint message_tool_calls_executor_check
    check (executor in ('client', 'server')),
  constraint message_tool_calls_status_check
    check (status in ('completed', 'rejected', 'failed')),
  constraint message_tool_calls_approval_status_check
    check (approval_status in ('not_required', 'approved', 'rejected'))
);

-- The application uses custom JWT authentication and accesses these tables
-- only from the server. With no public policies, browser Supabase keys cannot
-- read or modify application data.
alter table public.app_users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_tool_calls enable row level security;

commit;
