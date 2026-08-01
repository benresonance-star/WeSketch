create table public.ui_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    check (char_length(name) between 1 and 40 and name = btrim(name)),
  theme_mode text not null check (theme_mode in ('light', 'dark')),
  canvas_color text not null
    check (canvas_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index ui_configurations_user_id_updated_at_idx
  on public.ui_configurations (user_id, updated_at desc);

create trigger ui_configurations_set_updated_at
before update on public.ui_configurations
for each row execute function private.set_updated_at();

alter table public.ui_configurations enable row level security;

create policy "ui_configurations_select_own"
on public.ui_configurations for select to authenticated
using (user_id = (select auth.uid()));

create policy "ui_configurations_insert_own"
on public.ui_configurations for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "ui_configurations_update_own"
on public.ui_configurations for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "ui_configurations_delete_own"
on public.ui_configurations for delete to authenticated
using (user_id = (select auth.uid()));
