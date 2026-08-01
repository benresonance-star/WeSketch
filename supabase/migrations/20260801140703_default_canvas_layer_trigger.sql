create function private.handle_new_canvas_layer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.id,
    new.id,
    projects.owner_id,
    'Layer 1',
    0,
    1,
    true
  from public.projects
  where projects.id = new.project_id;

  return new;
end;
$$;

create trigger canvases_create_default_layer
after insert on public.canvases
for each row execute function private.handle_new_canvas_layer();
