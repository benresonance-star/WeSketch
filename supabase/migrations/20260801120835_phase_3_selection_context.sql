create table public.selections (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  selection_type text not null check (selection_type in ('rectangle', 'lasso')),
  bounds jsonb not null,
  path jsonb,
  created_at timestamptz not null default now()
);

create table public.context_snapshots (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null unique references public.selections (id) on delete cascade,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  selection_asset_path text not null,
  neighbourhood_asset_path text not null,
  canvas_asset_path text not null,
  canvas_revision text,
  created_at timestamptz not null default now()
);

create index selections_canvas_id_created_at_idx
  on public.selections (canvas_id, created_at desc);
create index selections_user_id_idx on public.selections (user_id);
create index context_snapshots_canvas_id_created_at_idx
  on public.context_snapshots (canvas_id, created_at desc);
create index context_snapshots_user_id_idx
  on public.context_snapshots (user_id);

alter table public.selections enable row level security;
alter table public.context_snapshots enable row level security;

create policy "selections_select_own"
on public.selections for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "selections_insert_own"
on public.selections for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "selections_delete_own"
on public.selections for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "context_snapshots_select_own"
on public.context_snapshots for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "context_snapshots_insert_own"
on public.context_snapshots for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "context_snapshots_update_own"
on public.context_snapshots for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "context_snapshots_delete_own"
on public.context_snapshots for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

grant select, insert, delete on public.selections to authenticated;
grant select, insert, update, delete on public.context_snapshots to authenticated;
