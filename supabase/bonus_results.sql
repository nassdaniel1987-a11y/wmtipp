-- Offizielle Bonus-Ergebnisse für Weltmeister, Torschützenkönig und Gruppensieger.
-- In Supabase Dashboard > SQL Editor ausführen.

create table if not exists public.bonus_results (
  id text primary key default 'official' check (id = 'official'),
  champion text,
  top_scorer text,
  group_winners jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bonus_results enable row level security;

grant select on public.bonus_results to anon, authenticated;
grant select, insert, update, delete on public.bonus_results to authenticated;

drop policy if exists "bonus results are readable" on public.bonus_results;
create policy "bonus results are readable"
on public.bonus_results for select
to anon, authenticated
using (true);

drop policy if exists "admins can manage bonus results" on public.bonus_results;
create policy "admins can manage bonus results"
on public.bonus_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
