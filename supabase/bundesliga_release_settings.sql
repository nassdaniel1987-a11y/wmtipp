-- Bundesliga release settings for Supabase.
-- Run after supabase/bundesliga_test_environment.sql.
-- Idempotent: safe to run more than once in Supabase SQL Editor.

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
  foreign_tips_visible_from text not null default 'kickoff' check (foreign_tips_visible_from in ('kickoff', 'match_finished', 'never')),
  tie_breakers jsonb not null default '["points", "matchday_wins", "match_points", "display_name"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.competition_rule_settings enable row level security;

grant select on public.competition_rule_settings to anon, authenticated;
grant select, insert, update, delete on public.competition_rule_settings to authenticated;

drop policy if exists "competition rule settings are readable" on public.competition_rule_settings;
create policy "competition rule settings are readable" on public.competition_rule_settings
for select to anon, authenticated using (true);

drop policy if exists "admins manage competition rule settings" on public.competition_rule_settings;
create policy "admins manage competition rule settings" on public.competition_rule_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
  'bundesliga-2025',
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
  public_slug = coalesce(public_slug, 'bundesliga-2025'),
  tip_lock_mode = coalesce(tip_lock_mode, 'kickoff'),
  bonus_deadline_at = coalesce(bonus_deadline_at, '2025-08-22 18:30:00+00'::timestamptz),
  status = 'admin_test',
  public_enabled = false,
  updated_at = now()
where id = 'bundesliga-2025';
