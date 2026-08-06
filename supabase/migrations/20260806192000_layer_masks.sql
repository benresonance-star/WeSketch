alter table public.canvas_layers
  add column if not exists has_mask boolean not null default false,
  add column if not exists mask_enabled boolean not null default true;

create table public.mask_strokes (
  id uuid primary key,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  layer_id uuid not null references public.canvas_layers (id) on delete cascade,
  points jsonb not null,
  style jsonb not null,
  z_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index mask_strokes_canvas_id_z_index_idx
  on public.mask_strokes (canvas_id, z_index)
  where deleted_at is null;
create index mask_strokes_user_id_idx on public.mask_strokes (user_id);
create index mask_strokes_layer_id_idx on public.mask_strokes (layer_id);

create trigger mask_strokes_set_updated_at
before update on public.mask_strokes
for each row execute function private.set_updated_at();

alter table public.mask_strokes enable row level security;

create policy "mask_strokes_select_own"
on public.mask_strokes for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "mask_strokes_insert_own"
on public.mask_strokes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "mask_strokes_update_own"
on public.mask_strokes for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "mask_strokes_delete_own"
on public.mask_strokes for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

grant select, insert, update, delete on public.mask_strokes to authenticated;
