alter table public.ai_runs
drop constraint ai_runs_status_check;

alter table public.ai_runs
add constraint ai_runs_status_check
check (status in ('pending', 'running', 'completed', 'failed', 'cancelled'));
