alter table public.projects
  add column if not exists archived_at timestamptz;

create index if not exists projects_owner_archived_updated_idx
  on public.projects (owner_id, archived_at nulls first, updated_at desc);
