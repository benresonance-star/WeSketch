create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled project' check (char_length(title) between 1 and 120),
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null default 'Canvas 1' check (char_length(name) between 1 and 120),
  width numeric not null check (width > 0),
  height numeric not null check (height > 0),
  background jsonb not null default '{"color":"#fbfaf6"}'::jsonb,
  viewport jsonb not null default '{"x":0,"y":0,"scale":1}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strokes (
  id uuid primary key,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  points jsonb not null,
  style jsonb not null,
  z_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  artifact_type text not null check (
    artifact_type in ('generated_image', 'imported_image', 'canvas_snapshot', 'selection_snapshot')
  ),
  storage_path text not null unique,
  mime_type text not null,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.canvas_objects (
  id uuid primary key,
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('image', 'note')),
  x numeric not null,
  y numeric not null,
  width numeric not null check (width > 0),
  height numeric not null check (height > 0),
  rotation numeric not null default 0,
  z_index integer not null default 0,
  artifact_id uuid references public.artifacts (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index projects_owner_id_updated_at_idx on public.projects (owner_id, updated_at desc);
create index canvases_project_id_idx on public.canvases (project_id);
create index strokes_canvas_id_z_index_idx on public.strokes (canvas_id, z_index) where deleted_at is null;
create index strokes_user_id_idx on public.strokes (user_id);
create index artifacts_project_id_created_at_idx on public.artifacts (project_id, created_at desc);
create index artifacts_canvas_id_idx on public.artifacts (canvas_id);
create index artifacts_user_id_idx on public.artifacts (user_id);
create index canvas_objects_canvas_id_z_index_idx on public.canvas_objects (canvas_id, z_index) where deleted_at is null;
create index canvas_objects_user_id_idx on public.canvas_objects (user_id);
create index canvas_objects_artifact_id_idx on public.canvas_objects (artifact_id);

create function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function private.set_updated_at();
create trigger canvases_set_updated_at before update on public.canvases
for each row execute function private.set_updated_at();
create trigger strokes_set_updated_at before update on public.strokes
for each row execute function private.set_updated_at();
create trigger canvas_objects_set_updated_at before update on public.canvas_objects
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'display_name', ''), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.is_project_owner(target_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = (select auth.uid())
  );
$$;

create function private.is_canvas_owner(target_canvas_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.canvases
    join public.projects on projects.id = canvases.project_id
    where canvases.id = target_canvas_id and projects.owner_id = (select auth.uid())
  );
$$;

create function private.is_owned_asset_path(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select
    (storage.foldername(object_name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(object_name))[2]
        and projects.owner_id = (select auth.uid())
    );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;
grant execute on function private.is_canvas_owner(uuid) to authenticated;
grant execute on function private.is_owned_asset_path(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.canvases enable row level security;
alter table public.strokes enable row level security;
alter table public.artifacts enable row level security;
alter table public.canvas_objects enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "projects_select_own" on public.projects for select to authenticated
using (owner_id = (select auth.uid()));
create policy "projects_insert_own" on public.projects for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "projects_update_own" on public.projects for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "projects_delete_own" on public.projects for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "canvases_select_own" on public.canvases for select to authenticated
using ((select private.is_project_owner(project_id)));
create policy "canvases_insert_own" on public.canvases for insert to authenticated
with check ((select private.is_project_owner(project_id)));
create policy "canvases_update_own" on public.canvases for update to authenticated
using ((select private.is_project_owner(project_id)))
with check ((select private.is_project_owner(project_id)));
create policy "canvases_delete_own" on public.canvases for delete to authenticated
using ((select private.is_project_owner(project_id)));

create policy "strokes_select_own" on public.strokes for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "strokes_insert_own" on public.strokes for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "strokes_update_own" on public.strokes for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)))
with check (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "strokes_delete_own" on public.strokes for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));

create policy "artifacts_select_own" on public.artifacts for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_project_owner(project_id)));
create policy "artifacts_insert_own" on public.artifacts for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_project_owner(project_id)));
create policy "artifacts_update_own" on public.artifacts for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_project_owner(project_id)))
with check (user_id = (select auth.uid()) and (select private.is_project_owner(project_id)));
create policy "artifacts_delete_own" on public.artifacts for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_project_owner(project_id)));

create policy "canvas_objects_select_own" on public.canvas_objects for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "canvas_objects_insert_own" on public.canvas_objects for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "canvas_objects_update_own" on public.canvas_objects for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)))
with check (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));
create policy "canvas_objects_delete_own" on public.canvas_objects for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_canvas_owner(canvas_id)));

grant select, insert, update, delete on public.profiles, public.projects, public.canvases,
  public.strokes, public.artifacts, public.canvas_objects to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-assets',
  'project-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "project_assets_select_own" on storage.objects for select to authenticated
using (bucket_id = 'project-assets' and (select private.is_owned_asset_path(name)));
create policy "project_assets_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'project-assets' and (select private.is_owned_asset_path(name)));
create policy "project_assets_update_own" on storage.objects for update to authenticated
using (bucket_id = 'project-assets' and (select private.is_owned_asset_path(name)))
with check (bucket_id = 'project-assets' and (select private.is_owned_asset_path(name)));
create policy "project_assets_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'project-assets' and (select private.is_owned_asset_path(name)));
