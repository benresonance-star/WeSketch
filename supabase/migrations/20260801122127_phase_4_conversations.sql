create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  root_selection_id uuid references public.selections (id) on delete set null,
  title text not null default 'Selection conversation'
    check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  selection_id uuid references public.selections (id) on delete set null,
  context_snapshot_id uuid references public.context_snapshots (id) on delete set null,
  provider text not null,
  model text not null,
  action text not null check (action in ('ask', 'generate', 'transform')),
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  prompt_version text not null,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  input_tokens bigint,
  output_tokens bigint,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  selection_id uuid references public.selections (id) on delete set null,
  ai_run_id uuid references public.ai_runs (id) on delete set null,
  parent_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index conversations_project_id_updated_at_idx
  on public.conversations (project_id, updated_at desc);
create index conversations_canvas_id_idx on public.conversations (canvas_id);
create index conversations_user_id_idx on public.conversations (user_id);
create index conversations_root_selection_id_idx
  on public.conversations (root_selection_id);
create index ai_runs_conversation_id_created_at_idx
  on public.ai_runs (conversation_id, created_at);
create index ai_runs_project_id_idx on public.ai_runs (project_id);
create index ai_runs_user_id_idx on public.ai_runs (user_id);
create index ai_runs_selection_id_idx on public.ai_runs (selection_id);
create index ai_runs_context_snapshot_id_idx
  on public.ai_runs (context_snapshot_id);
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);
create index messages_user_id_idx on public.messages (user_id);
create index messages_selection_id_idx on public.messages (selection_id);
create index messages_ai_run_id_idx on public.messages (ai_run_id);
create index messages_parent_message_id_idx on public.messages (parent_message_id);

create trigger conversations_set_updated_at before update on public.conversations
for each row execute function private.set_updated_at();

alter table public.conversations enable row level security;
alter table public.ai_runs enable row level security;
alter table public.messages enable row level security;

create policy "conversations_all_own"
on public.conversations for all to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_project_owner(project_id))
  and (select private.is_canvas_owner(canvas_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_project_owner(project_id))
  and (select private.is_canvas_owner(canvas_id))
);

create policy "ai_runs_all_own"
on public.ai_runs for all to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_project_owner(project_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_project_owner(project_id))
);

create policy "messages_select_own_conversation"
on public.messages for select to authenticated
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = (select auth.uid())
  )
);

create policy "messages_insert_own_conversation"
on public.messages for insert to authenticated
with check (
  (user_id is null or user_id = (select auth.uid()))
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = (select auth.uid())
  )
);

create policy "messages_update_own_conversation"
on public.messages for update to authenticated
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = (select auth.uid())
  )
)
with check (
  (user_id is null or user_id = (select auth.uid()))
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and conversations.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.conversations,
  public.ai_runs, public.messages to authenticated;
