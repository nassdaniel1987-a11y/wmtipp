-- The isolated relegation dress rehearsal is complete. Remove only its data.
-- The live update schema and the regular Bundesliga 2026/27 competition remain in place.

do $$
declare
  probe_id constant text := 'bundesliga-liveprobe-rel-2026';
begin
  delete from public.competition_participant_bonus_tips where competition_id = probe_id;
  delete from public.competition_tips where competition_id = probe_id;
  delete from public.competition_bonus_tips where competition_id = probe_id;
  delete from public.competition_demo_tips where competition_id = probe_id;
  delete from public.competition_demo_participants where competition_id = probe_id;
  delete from public.competition_results where competition_id = probe_id;
  delete from public.competition_goals where competition_id = probe_id;
  delete from public.competition_live_observations where competition_id = probe_id;
  delete from public.competition_bonus_results where competition_id = probe_id;
  delete from public.competition_top_scorers where competition_id = probe_id;

  update public.competition_invite_codes
    set participant_id = null, status = 'free', claimed_at = null
    where competition_id = probe_id;
  update public.competition_participants
    set invite_code_id = null
    where competition_id = probe_id;

  delete from public.competition_invite_codes where competition_id = probe_id;
  delete from public.competition_participants where competition_id = probe_id;
  delete from public.competition_matches where competition_id = probe_id;
  delete from public.competition_teams where competition_id = probe_id;
  delete from public.competition_rule_settings where competition_id = probe_id;
  delete from public.competitions where id = probe_id;
end $$;
