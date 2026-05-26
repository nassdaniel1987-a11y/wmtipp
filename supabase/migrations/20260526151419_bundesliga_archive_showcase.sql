-- Curated, read-only showcase profiles for the anonymous 2025/2026 archive demo.
-- Functions expose only these participant ids to anonymous archive viewers.

insert into public.competition_participants (competition_id, display_name)
values
  ('bundesliga-2025', 'Archivgast (Demo)'),
  ('bundesliga-2025', 'Mara (Demo)'),
  ('bundesliga-2025', 'Clemens (Demo)'),
  ('bundesliga-2025', 'Sofia (Demo)')
on conflict (competition_id, display_name) do nothing;

delete from public.competition_tips
where competition_id = 'bundesliga-2025'
  and participant_id in (
    select id
    from public.competition_participants
    where competition_id = 'bundesliga-2025'
      and display_name in ('Archivgast (Demo)', 'Mara (Demo)', 'Clemens (Demo)', 'Sofia (Demo)')
  );

with showcase as (
  select
    id as participant_id,
    case display_name
      when 'Archivgast (Demo)' then 1
      when 'Mara (Demo)' then 2
      when 'Clemens (Demo)' then 3
      else 4
    end as variant
  from public.competition_participants
  where competition_id = 'bundesliga-2025'
    and display_name in ('Archivgast (Demo)', 'Mara (Demo)', 'Clemens (Demo)', 'Sofia (Demo)')
),
finished_matches as (
  select
    match.id,
    result.score_a,
    result.score_b,
    row_number() over (order by match.matchday, match.match_number, match.id) as fixture_number
  from public.competition_matches match
  join public.competition_results result
    on result.match_id = match.id
   and result.competition_id = match.competition_id
   and result.status = 'final'
  where match.competition_id = 'bundesliga-2025'
    and match.phase in ('league', 'relegation')
)
insert into public.competition_tips (
  competition_id,
  participant_id,
  match_id,
  score_a,
  score_b,
  saved_at
)
select
  'bundesliga-2025',
  showcase.participant_id,
  match.id,
  case showcase.variant
    when 1 then least(12, match.score_a + case when match.fixture_number % 5 = 0 then 0 else 1 end)
    when 2 then least(12, match.score_a + case when match.fixture_number % 3 = 0 then 0 else 1 end)
    when 3 then least(12, match.score_a + case when match.fixture_number % 4 = 0 then 0 else 2 end)
    else least(12, match.score_a + case when match.fixture_number % 6 = 0 then 0 else 1 end)
  end,
  case showcase.variant
    when 1 then least(12, match.score_b)
    when 2 then least(12, match.score_b + case when match.fixture_number % 4 = 0 then 0 else 1 end)
    when 3 then least(12, match.score_b + case when match.fixture_number % 5 = 0 then 0 else 1 end)
    else least(12, match.score_b + case when match.fixture_number % 3 = 0 then 0 else 2 end)
  end,
  now()
from showcase
cross join finished_matches match;

delete from public.competition_participant_bonus_tips
where competition_id = 'bundesliga-2025'
  and participant_id in (
    select id
    from public.competition_participants
    where competition_id = 'bundesliga-2025'
      and display_name in ('Archivgast (Demo)', 'Mara (Demo)', 'Clemens (Demo)', 'Sofia (Demo)')
  );

with showcase as (
  select
    id as participant_id,
    case display_name
      when 'Archivgast (Demo)' then 1
      when 'Mara (Demo)' then 2
      when 'Clemens (Demo)' then 3
      else 4
    end as variant
  from public.competition_participants
  where competition_id = 'bundesliga-2025'
    and display_name in ('Archivgast (Demo)', 'Mara (Demo)', 'Clemens (Demo)', 'Sofia (Demo)')
),
ranked_teams as (
  select
    id,
    row_number() over (order by name, id) as position
  from public.competition_teams
  where competition_id = 'bundesliga-2025'
),
scorer as (
  select id, display_name
  from public.competition_top_scorers
  where competition_id = 'bundesliga-2025'
  order by goals desc, display_name
  limit 1
)
insert into public.competition_participant_bonus_tips (
  participant_id,
  competition_id,
  champion_team_id,
  top_scorer_id,
  top_scorer,
  relegated_team_ids,
  saved_at
)
select
  showcase.participant_id,
  'bundesliga-2025',
  champion.id,
  scorer.id,
  coalesce(scorer.display_name, 'Harry Kane'),
  array_remove(array[relegated_one.id, relegated_two.id, relegated_three.id], null)::uuid[],
  now()
from showcase
left join ranked_teams champion on champion.position = showcase.variant
left join ranked_teams relegated_one on relegated_one.position = 16
left join ranked_teams relegated_two on relegated_two.position = 17
left join ranked_teams relegated_three on relegated_three.position = 18
left join scorer on true;
