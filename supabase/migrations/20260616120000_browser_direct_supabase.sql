-- Browser-direkte Datenwege fuer das Web-Frontend.
--
-- Ziel: Netlify-Function-Invocations bei jedem Seitenaufruf auf ~0 senken.
-- Das Web liest oeffentliche Daten kuenftig direkt per Supabase (anon key + RLS),
-- aggregierte/geschuetzte Daten ueber SECURITY DEFINER RPCs (der Invite-Code ist
-- das Secret) und Live-Updates per Realtime. Die Netlify-Functions bleiben
-- unveraendert bestehen, weil die Android-App sie weiter nutzt.
--
-- Sicherheit: RLS bleibt restriktiv. anon bekommt KEINE direkten Schreibrechte
-- auf tips/participants/bonus_tips/invite_codes. Alle Schreibpfade laufen
-- ausschliesslich ueber die definer-Funktionen unten, die den Code pruefen.

-- ---------------------------------------------------------------------------
-- 1) Rangliste als Snapshot-Tabelle (anon lesbar, Realtime-faehig)
-- ---------------------------------------------------------------------------
-- Die Punktelogik (buildWmRanking) bleibt in JS und wird nur dann neu
-- berechnet, wenn sich Ergebnisse aendern (Admin-Functions / Scheduled Import),
-- nicht bei jedem Seitenaufruf. Das Web liest den Snapshot direkt.
create table if not exists public.wm_ranking (
  id text primary key default 'wm' check (id = 'wm'),
  ranking jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.wm_ranking enable row level security;
grant select on public.wm_ranking to anon, authenticated;

drop policy if exists "wm ranking is readable" on public.wm_ranking;
create policy "wm ranking is readable"
on public.wm_ranking for select
to anon, authenticated
using (true);

-- Basis-Snapshot setzen, damit das Web sofort eine (ggf. punktlose) Rangliste
-- sieht und der Function-Fallback nicht anspringt. Sobald ein Ergebnis
-- gespeichert wird, ueberschreibt der JS-Refresh dies mit echten Punkten.
insert into public.wm_ranking (id, ranking, updated_at)
select
  'wm',
  coalesce(
    jsonb_agg(jsonb_build_object(
      'name', display_name,
      'points', 0, 'matchPoints', 0, 'bonusPoints', 0,
      'tipCount', 0, 'scoredTipCount', 0, 'averagePoints', 0
    ) order by display_name),
    '[]'::jsonb
  ),
  now()
from public.participants
on conflict (id) do nothing;

-- Realtime fuer Live-Score- und Ranglisten-Updates aktivieren (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wm_ranking'
  ) then
    alter publication supabase_realtime add table public.wm_ranking;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'results'
  ) then
    alter publication supabase_realtime add table public.results;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Community-Trends: reine Aggregation, keine Identitaet -> definer + anon
-- ---------------------------------------------------------------------------
create or replace function public.wm_tip_trends()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(match_id, trend), '{}'::jsonb)
  from (
    select
      match_id,
      jsonb_build_object(
        'total', count(*),
        'homeWin', count(*) filter (where score_a > score_b),
        'draw', count(*) filter (where score_a = score_b),
        'awayWin', count(*) filter (where score_a < score_b),
        'homeWinPercent', round(count(*) filter (where score_a > score_b)::numeric * 100 / count(*)),
        'drawPercent', round(count(*) filter (where score_a = score_b)::numeric * 100 / count(*)),
        'awayWinPercent', greatest(
          0,
          100
            - round(count(*) filter (where score_a > score_b)::numeric * 100 / count(*))
            - round(count(*) filter (where score_a = score_b)::numeric * 100 / count(*))
        )
      ) as trend
    from public.tips
    group by match_id
  ) grouped;
$$;

-- ---------------------------------------------------------------------------
-- 3) Teilnehmer per Code aufloesen (ersetzt /api/participant fuers Web)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_participant(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_invite record;
  v_part record;
begin
  if v_code = '' then
    return jsonb_build_object('participant', null, 'codeStatus', 'missing');
  end if;

  select id, code, status, participant_id
    into v_invite
    from public.invite_codes
   where code = v_code;

  if not found then
    return jsonb_build_object('participant', null, 'codeStatus', 'unknown');
  end if;

  if v_invite.participant_id is not null then
    select id, display_name, invite_code_id
      into v_part
      from public.participants
     where id = v_invite.participant_id;

    return jsonb_build_object(
      'participant', jsonb_build_object(
        'id', v_part.id,
        'display_name', v_part.display_name,
        'invite_code_id', v_part.invite_code_id
      ),
      'codeStatus', v_invite.status,
      'code', v_invite.code
    );
  end if;

  return jsonb_build_object('participant', null, 'codeStatus', v_invite.status, 'code', v_invite.code);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Eigene Tipps / Bonus-Tipps lesen (Code = Secret)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_tips(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'match_id', t.match_id,
      'score_a', t.score_a,
      'score_b', t.score_b,
      'saved_at', t.saved_at
    )),
    '[]'::jsonb
  )
  from public.tips t
  join public.invite_codes ic on ic.participant_id = t.participant_id
  where ic.code = trim(coalesce(p_code, ''))
    and trim(coalesce(p_code, '')) <> '';
$$;

create or replace function public.get_my_bonus_tip(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(b) - 'participant_id'
  from public.bonus_tips b
  join public.invite_codes ic on ic.participant_id = b.participant_id
  where ic.code = trim(coalesce(p_code, ''))
    and trim(coalesce(p_code, '')) <> ''
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 5) Code einloesen (ersetzt /api/claim-code fuers Web)
-- ---------------------------------------------------------------------------
create or replace function public.claim_invite_code(p_code text, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_name text := trim(coalesce(p_name, ''));
  v_invite record;
  v_part record;
begin
  if v_code = '' or char_length(v_name) < 2 then
    raise exception 'Code und Name sind erforderlich.';
  end if;

  select id, code, status, participant_id
    into v_invite
    from public.invite_codes
   where code = v_code;

  if not found then
    raise exception 'Dieser QR-Code ist nicht bekannt.';
  end if;
  if v_invite.status = 'disabled' then
    raise exception 'Dieser QR-Code ist gesperrt.';
  end if;

  -- Bereits eingeloest: bestehenden Teilnehmer zurueckgeben.
  if v_invite.participant_id is not null then
    select id, display_name, invite_code_id
      into v_part
      from public.participants
     where id = v_invite.participant_id;
    return jsonb_build_object(
      'participant', jsonb_build_object('id', v_part.id, 'display_name', v_part.display_name, 'invite_code_id', v_part.invite_code_id),
      'code', v_code,
      'alreadyClaimed', true
    );
  end if;

  insert into public.participants (display_name, invite_code_id)
    values (v_name, v_invite.id)
    returning id, display_name, invite_code_id into v_part;

  update public.invite_codes
     set status = 'claimed',
         participant_id = v_part.id,
         claimed_at = now()
   where id = v_invite.id;

  return jsonb_build_object(
    'participant', jsonb_build_object('id', v_part.id, 'display_name', v_part.display_name, 'invite_code_id', v_part.invite_code_id),
    'code', v_code,
    'alreadyClaimed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Tipps speichern (ersetzt /api/save-tips fuers Web)
-- ---------------------------------------------------------------------------
-- p_tips: jsonb-Array aus { "matchId": text, "scoreA": int, "scoreB": int }
create or replace function public.save_my_tips(p_code text, p_tips jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_pid uuid;
  v_locked record;
begin
  if v_code = '' or p_tips is null or jsonb_typeof(p_tips) <> 'array' then
    raise exception 'Teilnehmer und Tipps sind erforderlich.';
  end if;

  select participant_id into v_pid from public.invite_codes where code = v_code;
  if v_pid is null then
    raise exception 'Dieser QR-Code ist nicht aktiviert.';
  end if;

  -- Score-Validierung (0..12, ganzzahlig, matchId vorhanden).
  if exists (
    select 1 from jsonb_array_elements(p_tips) e
    where coalesce(e->>'matchId', '') = ''
       or (e->>'scoreA') is null
       or (e->>'scoreB') is null
       or (e->>'scoreA') !~ '^\d+$'
       or (e->>'scoreB') !~ '^\d+$'
       or (e->>'scoreA')::int > 12
       or (e->>'scoreB')::int > 12
  ) then
    raise exception 'Mindestens ein Tipp ist ungueltig.';
  end if;

  -- Anstoss-Sperre: kein Tipp fuer bereits begonnene Spiele.
  select m.team_a, m.team_b
    into v_locked
    from public.matches m
    join (select e->>'matchId' as mid from jsonb_array_elements(p_tips) e) x on x.mid = m.id
   where m.kickoff_at is not null and m.kickoff_at <= now()
   limit 1;
  if found then
    raise exception 'Tipp gesperrt: % - % hat bereits begonnen.', v_locked.team_a, v_locked.team_b;
  end if;

  insert into public.tips (participant_id, match_id, score_a, score_b, saved_at)
  select v_pid, e->>'matchId', (e->>'scoreA')::int, (e->>'scoreB')::int, now()
    from jsonb_array_elements(p_tips) e
  on conflict (participant_id, match_id)
    do update set score_a = excluded.score_a,
                  score_b = excluded.score_b,
                  saved_at = excluded.saved_at;

  return jsonb_build_object('tips', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'match_id', t.match_id, 'score_a', t.score_a, 'score_b', t.score_b, 'saved_at', t.saved_at
    )), '[]'::jsonb)
    from public.tips t
    where t.participant_id = v_pid
      and t.match_id in (select e->>'matchId' from jsonb_array_elements(p_tips) e)
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Bonus-Tipps speichern (ersetzt /api/save-bonus-tips fuers Web)
-- ---------------------------------------------------------------------------
create or replace function public.save_my_bonus_tips(
  p_code text,
  p_champion text,
  p_top_scorer text,
  p_top_scorer_player_id text,
  p_group_winners jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_pid uuid;
  v_champion text := nullif(trim(coalesce(p_champion, '')), '');
  v_top_scorer text := nullif(trim(coalesce(p_top_scorer, '')), '');
  v_player_id text := nullif(trim(coalesce(p_top_scorer_player_id, '')), '');
  v_groups jsonb := case when jsonb_typeof(coalesce(p_group_winners, '{}'::jsonb)) = 'object'
                         then p_group_winners else '{}'::jsonb end;
  v_existing record;
  v_tournament_deadline timestamptz;
  v_canonical_top text;
  v_player record;
  v_group record;
  v_now timestamptz := now();
begin
  if v_code = '' then
    raise exception 'Teilnehmer fehlt.';
  end if;

  select participant_id into v_pid from public.invite_codes where code = v_code;
  if v_pid is null then
    raise exception 'Dieser QR-Code ist nicht aktiviert.';
  end if;

  select champion, top_scorer, top_scorer_player_id, group_winners
    into v_existing
    from public.bonus_tips
   where participant_id = v_pid;

  select min(kickoff_at) into v_tournament_deadline
    from public.matches where kickoff_at is not null;

  -- Weltmeister / Torschuetzenkoenig nach Turnierstart gesperrt.
  if v_tournament_deadline is not null and v_now >= v_tournament_deadline and (
       coalesce(trim(coalesce(v_existing.champion, '')), '') is distinct from coalesce(v_champion, '')
    or coalesce(trim(coalesce(v_existing.top_scorer, '')), '') is distinct from coalesce(v_top_scorer, '')
    or coalesce(trim(coalesce(v_existing.top_scorer_player_id::text, '')), '') is distinct from coalesce(v_player_id, '')
  ) then
    raise exception 'Weltmeister und Torschuetzenkoenig sind nach Turnierstart gesperrt.';
  end if;

  v_canonical_top := v_top_scorer;
  if v_player_id is not null then
    select id, display_name, active into v_player from public.players where id = v_player_id::uuid;
    if not found then
      raise exception 'Dieser Spieler ist nicht bekannt.';
    end if;
    if not v_player.active then
      raise exception 'Dieser Spieler ist nicht mehr auswaehlbar.';
    end if;
    v_canonical_top := v_player.display_name;
  end if;

  -- Gruppensieger pro Gruppe nach jeweiligem Gruppenstart gesperrt.
  for v_group in
    select group_key, min(kickoff_at) as deadline
      from public.matches
     where group_key is not null and kickoff_at is not null
     group by group_key
  loop
    if v_now >= v_group.deadline
       and coalesce(trim(coalesce(v_existing.group_winners ->> v_group.group_key, '')), '')
           is distinct from coalesce(trim(coalesce(v_groups ->> v_group.group_key, '')), '') then
      raise exception 'Gruppensieger Gruppe % ist bereits gesperrt.', v_group.group_key;
    end if;
  end loop;

  insert into public.bonus_tips (participant_id, champion, top_scorer, top_scorer_player_id, group_winners, saved_at)
  values (v_pid, v_champion, nullif(v_canonical_top, ''), v_player_id::uuid, v_groups, v_now)
  on conflict (participant_id)
    do update set champion = excluded.champion,
                  top_scorer = excluded.top_scorer,
                  top_scorer_player_id = excluded.top_scorer_player_id,
                  group_winners = excluded.group_winners,
                  saved_at = excluded.saved_at;

  return jsonb_build_object('bonusTip', (
    select to_jsonb(b) - 'participant_id' from public.bonus_tips b where b.participant_id = v_pid
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Ausfuehrungsrechte: Reads fuer anon+authenticated, Writes nur ueber RPC.
-- ---------------------------------------------------------------------------
grant execute on function public.wm_tip_trends() to anon, authenticated;
grant execute on function public.resolve_participant(text) to anon, authenticated;
grant execute on function public.get_my_tips(text) to anon, authenticated;
grant execute on function public.get_my_bonus_tip(text) to anon, authenticated;
grant execute on function public.claim_invite_code(text, text) to anon, authenticated;
grant execute on function public.save_my_tips(text, jsonb) to anon, authenticated;
grant execute on function public.save_my_bonus_tips(text, text, text, text, jsonb) to anon, authenticated;
