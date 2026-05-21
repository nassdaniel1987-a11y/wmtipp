-- Bundesliga test environment for Supabase.
-- Keeps Bundesliga test data separate from the live WM tables.

create extension if not exists pgcrypto;

create table if not exists public.competitions (
  id text primary key,
  name text not null,
  season_label text not null,
  status text not null default 'admin_test' check (status in ('admin_test', 'public', 'archived')),
  source_provider text,
  source_league text,
  source_season integer,
  public_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.competitions (id, name, season_label, status, source_provider, source_league, source_season, public_enabled)
values
  ('wm-2026', 'WM 2026', '2026', 'public', 'local', 'WC', 2026, true),
  ('bundesliga-2025', 'Bundesliga', '2025/2026', 'admin_test', 'openligadb', 'bl1', 2025, false)
on conflict (id) do update set
  name = excluded.name,
  season_label = excluded.season_label,
  status = excluded.status,
  source_provider = excluded.source_provider,
  source_league = excluded.source_league,
  source_season = excluded.source_season,
  public_enabled = excluded.public_enabled,
  updated_at = now();

create table if not exists public.competition_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null references public.competitions(id) on delete cascade,
  external_id text not null,
  name text not null,
  short_name text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, external_id)
);

create table if not exists public.competition_matches (
  id text primary key,
  competition_id text not null references public.competitions(id) on delete cascade,
  external_id text not null,
  match_number integer not null,
  matchday integer not null,
  phase text not null default 'league',
  kickoff_at timestamptz,
  match_date date not null,
  match_time text not null,
  team_a_id uuid references public.competition_teams(id) on delete set null,
  team_b_id uuid references public.competition_teams(id) on delete set null,
  team_a_name text not null,
  team_b_name text not null,
  status text not null default 'scheduled',
  source_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (competition_id, external_id),
  unique (competition_id, match_number)
);

create table if not exists public.competition_results (
  match_id text primary key references public.competition_matches(id) on delete cascade,
  competition_id text not null references public.competitions(id) on delete cascade,
  score_a integer not null check (score_a between 0 and 30),
  score_b integer not null check (score_b between 0 and 30),
  status text not null default 'final' check (status in ('scheduled', 'live', 'final')),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_goals (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null references public.competitions(id) on delete cascade,
  match_id text not null references public.competition_matches(id) on delete cascade,
  external_goal_id text,
  scorer_name text not null,
  scorer_external_id text,
  team_side text check (team_side in ('home', 'away')),
  minute integer,
  is_own_goal boolean not null default false,
  is_penalty boolean not null default false,
  source_json jsonb not null default '{}'::jsonb,
  unique (competition_id, external_goal_id)
);

create table if not exists public.competition_demo_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null references public.competitions(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (competition_id, display_name)
);

create table if not exists public.competition_demo_tips (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null references public.competitions(id) on delete cascade,
  participant_id uuid not null references public.competition_demo_participants(id) on delete cascade,
  match_id text not null references public.competition_matches(id) on delete cascade,
  score_a integer not null check (score_a between 0 and 12),
  score_b integer not null check (score_b between 0 and 12),
  saved_at timestamptz not null default now(),
  unique (competition_id, participant_id, match_id)
);

create table if not exists public.competition_bonus_tips (
  participant_id uuid primary key references public.competition_demo_participants(id) on delete cascade,
  competition_id text not null references public.competitions(id) on delete cascade,
  champion_team_id uuid references public.competition_teams(id) on delete set null,
  top_scorer text,
  relegated_team_ids uuid[] not null default '{}'::uuid[],
  saved_at timestamptz not null default now()
);

create table if not exists public.competition_bonus_results (
  competition_id text primary key references public.competitions(id) on delete cascade,
  champion_team_id uuid references public.competition_teams(id) on delete set null,
  top_scorers text[] not null default '{}'::text[],
  relegated_team_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);

alter table public.competitions enable row level security;
alter table public.competition_teams enable row level security;
alter table public.competition_matches enable row level security;
alter table public.competition_results enable row level security;
alter table public.competition_goals enable row level security;
alter table public.competition_demo_participants enable row level security;
alter table public.competition_demo_tips enable row level security;
alter table public.competition_bonus_tips enable row level security;
alter table public.competition_bonus_results enable row level security;

grant select on public.competitions to anon, authenticated;
grant select on public.competition_teams to anon, authenticated;
grant select on public.competition_matches to anon, authenticated;
grant select on public.competition_results to anon, authenticated;
grant select on public.competition_goals to anon, authenticated;
grant select, insert, update, delete on public.competitions to authenticated;
grant select, insert, update, delete on public.competition_teams to authenticated;
grant select, insert, update, delete on public.competition_matches to authenticated;
grant select, insert, update, delete on public.competition_results to authenticated;
grant select, insert, update, delete on public.competition_goals to authenticated;
grant select, insert, update, delete on public.competition_demo_participants to authenticated;
grant select, insert, update, delete on public.competition_demo_tips to authenticated;
grant select, insert, update, delete on public.competition_bonus_tips to authenticated;
grant select, insert, update, delete on public.competition_bonus_results to authenticated;

drop policy if exists "competitions are readable" on public.competitions;
create policy "competitions are readable" on public.competitions
for select to anon, authenticated using (true);

drop policy if exists "competition teams are readable" on public.competition_teams;
create policy "competition teams are readable" on public.competition_teams
for select to anon, authenticated using (true);

drop policy if exists "competition matches are readable" on public.competition_matches;
create policy "competition matches are readable" on public.competition_matches
for select to anon, authenticated using (true);

drop policy if exists "competition results are readable" on public.competition_results;
create policy "competition results are readable" on public.competition_results
for select to anon, authenticated using (true);

drop policy if exists "competition goals are readable" on public.competition_goals;
create policy "competition goals are readable" on public.competition_goals
for select to anon, authenticated using (true);

drop policy if exists "admins manage competitions" on public.competitions;
create policy "admins manage competitions" on public.competitions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition teams" on public.competition_teams;
create policy "admins manage competition teams" on public.competition_teams
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition matches" on public.competition_matches;
create policy "admins manage competition matches" on public.competition_matches
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition results" on public.competition_results;
create policy "admins manage competition results" on public.competition_results
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition goals" on public.competition_goals;
create policy "admins manage competition goals" on public.competition_goals
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage demo participants" on public.competition_demo_participants;
create policy "admins manage demo participants" on public.competition_demo_participants
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage demo tips" on public.competition_demo_tips;
create policy "admins manage demo tips" on public.competition_demo_tips
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition bonus tips" on public.competition_bonus_tips;
create policy "admins manage competition bonus tips" on public.competition_bonus_tips
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage competition bonus results" on public.competition_bonus_results;
create policy "admins manage competition bonus results" on public.competition_bonus_results
for all to authenticated using (public.is_admin()) with check (public.is_admin());
