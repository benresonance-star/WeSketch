alter table public.projects
  add column if not exists sort_order integer not null default 0;

with ordered as (
  select
    id,
    row_number() over (
      partition by owner_id, (archived_at is not null)
      order by updated_at desc
    ) - 1 as position
  from public.projects
)
update public.projects
set sort_order = ordered.position
from ordered
where projects.id = ordered.id;

create index if not exists projects_owner_sort_idx
  on public.projects (owner_id, archived_at nulls first, sort_order asc);
