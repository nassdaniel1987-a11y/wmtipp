-- Bundesliga live score support and isolated relegation dress rehearsal.
-- Adds only Bundesliga-facing configuration; WM rows remain unchanged.

alter table public.competitions
  add column if not exists live_updates_paused boolean not null default false;

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
  live_updates_paused
)
values (
  'bundesliga-liveprobe-rel-2026',
  'Relegation Liveprobe',
  'Relegation Liveprobe 2025/2026',
  'admin_test',
  'openligadb',
  'rel',
  2025,
  false,
  'bundesliga-liveprobe-rel-2026',
  'kickoff',
  false
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
  'bundesliga-liveprobe-rel-2026',
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
