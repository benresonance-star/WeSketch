create table public.canvas_layers (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  opacity numeric not null default 1 check (opacity between 0 and 1),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canvas_layers_canvas_id_sort_order_idx
  on public.canvas_layers (canvas_id, sort_order);
create index canvas_layers_user_id_idx on public.canvas_layers (user_id);

create trigger canvas_layers_set_updated_at
before update on public.canvas_layers
for each row execute function private.set_updated_at();

alter table public.canvas_layers enable row level security;

create policy "canvas_layers_select_own"
on public.canvas_layers for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "canvas_layers_insert_own"
on public.canvas_layers for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "canvas_layers_update_own"
on public.canvas_layers for update to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

create policy "canvas_layers_delete_own"
on public.canvas_layers for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_canvas_owner(canvas_id))
);

insert into public.canvas_layers (
  id,
  canvas_id,
  user_id,
  name,
  sort_order,
  opacity,
  is_visible
)
select
  canvases.id,
  canvases.id,
  projects.owner_id,
  'Layer 1',
  0,
  1,
  true
from public.canvases
join public.projects on projects.id = canvases.project_id;

alter table public.strokes
  add column layer_id uuid references public.canvas_layers (id) on delete restrict;
update public.strokes set layer_id = canvas_id;
alter table public.strokes alter column layer_id set not null;
create index strokes_layer_id_idx on public.strokes (layer_id);

alter table public.canvas_objects
  add column layer_id uuid references public.canvas_layers (id) on delete restrict;
update public.canvas_objects set layer_id = canvas_id;
alter table public.canvas_objects alter column layer_id set not null;
create index canvas_objects_layer_id_idx on public.canvas_objects (layer_id);
