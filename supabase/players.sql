-- Admin-gepflegte Spielerliste für den Torschützenkönig-Bonus.
-- In Supabase Dashboard > SQL Editor ausführen.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 2 and 100),
  team_name text,
  aliases jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;

grant select on public.players to anon, authenticated;
grant insert, update, delete on public.players to authenticated;

drop policy if exists "players are readable" on public.players;
create policy "players are readable"
on public.players for select
to anon, authenticated
using (active = true);

drop policy if exists "admins can manage players" on public.players;
create policy "admins can manage players"
on public.players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.bonus_tips
  add column if not exists top_scorer_player_id uuid references public.players(id) on delete set null;

alter table public.bonus_results
  add column if not exists top_scorer_player_ids uuid[] not null default '{}'::uuid[];
