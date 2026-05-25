-- Bundesliga 2026/27 live foundation and release hardening.
-- Keeps the 2025/26 test competition intact and hidden.
-- Safe to run once in the existing WM project; regular WM tables are untouched.

alter table public.competitions
  add column if not exists public_slug text,
  add column if not exists tip_lock_mode text not null default 'kickoff',
  add column if not exists bonus_deadline_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_tip_lock_mode_check'
  ) then
    alter table public.competitions
      add constraint competitions_tip_lock_mode_check
      check (tip_lock_mode in ('kickoff', 'manual', 'disabled'));
  end if;
end $$;

create table if not exists public.competition_rule_settings (
  competition_id text primary key references public.competitions(id) on delete cascade,
  exact_score_points integer not null default 4 check (exact_score_points >= 0),
  goal_diff_points integer not null default 3 check (goal_diff_points >= 0),
  tendency_points integer not null default 2 check (tendency_points >= 0),
  champion_bonus_points integer not null default 6 check (champion_bonus_points >= 0),
  top_scorer_bonus_points integer not null default 6 check (top_scorer_bonus_points >= 0),
  relegated_team_bonus_points integer not null default 4 check (relegated_team_bonus_points >= 0),
  foreign_tips_visible_from text not null default 'kickoff'
    check (foreign_tips_visible_from in ('kickoff', 'match_finished', 'never')),
  tie_breakers jsonb not null default '["points", "matchday_wins", "match_points", "display_name"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.competition_rule_settings enable row level security;
grant select on public.competition_rule_settings to anon, authenticated;
grant select, insert, update, delete on public.competition_rule_settings to authenticated;

drop policy if exists "admins manage competition rule settings" on public.competition_rule_settings;
create policy "admins manage competition rule settings" on public.competition_rule_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.competitions (
  id,
  name,
  season_label,
  status,
  source_provider,
  source_league,
  source_season,
  public_enabled,
  public_slug,
  tip_lock_mode,
  bonus_deadline_at
)
values (
  'bundesliga-2026',
  'Bundesliga',
  '2026/2027',
  'admin_test',
  'openligadb',
  'bl1',
  2026,
  false,
  'bundesliga-2026',
  'kickoff',
  null
)
on conflict (id) do update set
  name = excluded.name,
  season_label = excluded.season_label,
  status = 'admin_test',
  source_provider = excluded.source_provider,
  source_league = excluded.source_league,
  source_season = excluded.source_season,
  public_enabled = false,
  public_slug = excluded.public_slug,
  tip_lock_mode = excluded.tip_lock_mode,
  updated_at = now();

insert into public.competition_rule_settings (
  competition_id,
  exact_score_points,
  goal_diff_points,
  tendency_points,
  champion_bonus_points,
  top_scorer_bonus_points,
  relegated_team_bonus_points,
  foreign_tips_visible_from,
  tie_breakers
)
values (
  'bundesliga-2026',
  4,
  3,
  2,
  6,
  6,
  4,
  'kickoff',
  '["points", "matchday_wins", "match_points", "display_name"]'::jsonb
)
on conflict (competition_id) do update set
  exact_score_points = excluded.exact_score_points,
  goal_diff_points = excluded.goal_diff_points,
  tendency_points = excluded.tendency_points,
  champion_bonus_points = excluded.champion_bonus_points,
  top_scorer_bonus_points = excluded.top_scorer_bonus_points,
  relegated_team_bonus_points = excluded.relegated_team_bonus_points,
  foreign_tips_visible_from = excluded.foreign_tips_visible_from,
  tie_breakers = excluded.tie_breakers,
  updated_at = now();

update public.competitions
set
  status = 'admin_test',
  public_enabled = false,
  updated_at = now()
where id = 'bundesliga-2025';

create unique index if not exists competition_participants_invite_code_unique
  on public.competition_participants (invite_code_id)
  where invite_code_id is not null;

create or replace function public.claim_invite_code_on_participant_link()
returns trigger
language plpgsql
as $$
begin
  if new.invite_code_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.competition_invite_codes
    where id = new.invite_code_id
      and competition_id = new.competition_id
      and participant_id = new.id
      and status = 'claimed'
  ) then
    return new;
  end if;

  update public.competition_invite_codes
  set
    status = 'claimed',
    participant_id = new.id,
    claimed_at = coalesce(claimed_at, now())
  where id = new.invite_code_id
    and competition_id = new.competition_id
    and status = 'free'
    and participant_id is null;

  if not found then
    raise exception 'Dieser Einladungscode ist nicht mehr frei.';
  end if;

  return new;
end;
$$;

drop trigger if exists competition_participant_claim_invite_code on public.competition_participants;
create trigger competition_participant_claim_invite_code
after insert or update of invite_code_id on public.competition_participants
for each row execute function public.claim_invite_code_on_participant_link();

drop policy if exists "competitions are readable" on public.competitions;
create policy "competitions are readable" on public.competitions
for select to anon, authenticated using (public_enabled = true);

drop policy if exists "competition teams are readable" on public.competition_teams;
create policy "competition teams are readable" on public.competition_teams
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_teams.competition_id
      and competitions.public_enabled = true
  )
);

drop policy if exists "competition matches are readable" on public.competition_matches;
create policy "competition matches are readable" on public.competition_matches
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_matches.competition_id
      and competitions.public_enabled = true
  )
);

drop policy if exists "competition results are readable" on public.competition_results;
create policy "competition results are readable" on public.competition_results
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_results.competition_id
      and competitions.public_enabled = true
  )
);

drop policy if exists "competition goals are readable" on public.competition_goals;
create policy "competition goals are readable" on public.competition_goals
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_goals.competition_id
      and competitions.public_enabled = true
  )
);

drop policy if exists "competition top scorers are readable" on public.competition_top_scorers;
create policy "competition top scorers are readable" on public.competition_top_scorers
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_top_scorers.competition_id
      and competitions.public_enabled = true
  )
);

drop policy if exists "competition rule settings are readable" on public.competition_rule_settings;
create policy "competition rule settings are readable" on public.competition_rule_settings
for select to anon, authenticated using (
  exists (
    select 1 from public.competitions
    where competitions.id = competition_rule_settings.competition_id
      and competitions.public_enabled = true
  )
);
