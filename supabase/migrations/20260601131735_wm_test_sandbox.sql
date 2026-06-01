create table if not exists public.wm_test_results (
  match_id text primary key references public.matches(id) on delete cascade,
  score_a integer not null check (score_a between 0 and 30),
  score_b integer not null check (score_b between 0 and 30),
  status text not null default 'final' check (status in ('scheduled', 'live', 'final')),
  updated_at timestamptz not null default now()
);

create table if not exists public.wm_test_bonus_results (
  id text primary key default 'sandbox' check (id = 'sandbox'),
  champion text,
  top_scorer text,
  top_scorer_player_ids uuid[] not null default '{}'::uuid[],
  group_winners jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wm_test_results enable row level security;
alter table public.wm_test_bonus_results enable row level security;

grant select, insert, update, delete on public.wm_test_results to authenticated;
grant select, insert, update, delete on public.wm_test_bonus_results to authenticated;

drop policy if exists "admins manage wm test results" on public.wm_test_results;
create policy "admins manage wm test results"
on public.wm_test_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage wm test bonus results" on public.wm_test_bonus_results;
create policy "admins manage wm test bonus results"
on public.wm_test_bonus_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
