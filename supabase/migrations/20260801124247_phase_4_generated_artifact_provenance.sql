alter table public.artifacts
add column source_ai_run_id uuid references public.ai_runs (id) on delete set null;

create index artifacts_source_ai_run_id_idx
on public.artifacts (source_ai_run_id);
