-- WM 2026 K.o.-Phase: Platzhalter-Spiele (R32 -> Finale + Spiel um Platz 3).
-- Generiert aus src/koBracket.js (eine Quelle der Wahrheit).
--
-- WICHTIG: Erst ausfuehren, wenn die admin-gegatete K.o.-Ansicht deployt ist,
-- sonst sehen Teilnehmer sofort leere K.o.-Spiele.
-- team_a/team_b sind Platzhalter-Labels; sie werden beim Aufloesen der
-- Paarungen (Auto-Berechnung/Admin) mit echten Teamnamen ueberschrieben.

insert into public.matches (
  id, match_number, phase, group_key, kickoff_at, match_date, match_time,
  team_a, team_b, flag_code_a, flag_code_b, venue, city, status
) values
('ko-r32-01', 73, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe A', 'Bester Dritter 1', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-02', 74, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe C', 'Zweiter Gruppe F', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-03', 75, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe E', 'Bester Dritter 2', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-04', 76, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe G', 'Zweiter Gruppe H', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-05', 77, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe I', 'Bester Dritter 3', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-06', 78, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe K', 'Zweiter Gruppe L', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-07', 79, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe B', 'Bester Dritter 4', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-08', 80, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe D', 'Zweiter Gruppe A', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-09', 81, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe F', 'Bester Dritter 5', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-10', 82, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe H', 'Zweiter Gruppe C', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-11', 83, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe J', 'Bester Dritter 6', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-12', 84, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe L', 'Zweiter Gruppe E', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-13', 85, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe B', 'Bester Dritter 7', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-14', 86, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe D', 'Zweiter Gruppe G', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-15', 87, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe I', 'Bester Dritter 8', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-16', 88, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe J', 'Zweiter Gruppe K', '', '', '', '', 'Sechzehntelfinale'),
('ko-r16-01', 89, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 1', 'Sieger Sechzehntelfinale 2', '', '', '', '', 'Achtelfinale'),
('ko-r16-02', 90, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 3', 'Sieger Sechzehntelfinale 4', '', '', '', '', 'Achtelfinale'),
('ko-r16-03', 91, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 5', 'Sieger Sechzehntelfinale 6', '', '', '', '', 'Achtelfinale'),
('ko-r16-04', 92, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 7', 'Sieger Sechzehntelfinale 8', '', '', '', '', 'Achtelfinale'),
('ko-r16-05', 93, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 9', 'Sieger Sechzehntelfinale 10', '', '', '', '', 'Achtelfinale'),
('ko-r16-06', 94, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 11', 'Sieger Sechzehntelfinale 12', '', '', '', '', 'Achtelfinale'),
('ko-r16-07', 95, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 13', 'Sieger Sechzehntelfinale 14', '', '', '', '', 'Achtelfinale'),
('ko-r16-08', 96, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Sechzehntelfinale 15', 'Sieger Sechzehntelfinale 16', '', '', '', '', 'Achtelfinale'),
('ko-quarter-01', 97, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Achtelfinale 1', 'Sieger Achtelfinale 2', '', '', '', '', 'Viertelfinale'),
('ko-quarter-02', 98, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Achtelfinale 3', 'Sieger Achtelfinale 4', '', '', '', '', 'Viertelfinale'),
('ko-quarter-03', 99, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Achtelfinale 5', 'Sieger Achtelfinale 6', '', '', '', '', 'Viertelfinale'),
('ko-quarter-04', 100, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Achtelfinale 7', 'Sieger Achtelfinale 8', '', '', '', '', 'Viertelfinale'),
('ko-semi-01', 101, 'semi', null, '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Sieger Viertelfinale 1', 'Sieger Viertelfinale 2', '', '', '', '', 'Halbfinale'),
('ko-semi-02', 102, 'semi', null, '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Sieger Viertelfinale 3', 'Sieger Viertelfinale 4', '', '', '', '', 'Halbfinale'),
('ko-third-01', 103, 'third', null, '2026-07-18T19:00:00.000Z', '2026-07-18', '21:00', 'Verlierer Halbfinale 1', 'Verlierer Halbfinale 2', '', '', '', '', 'Spiel um Platz 3'),
('ko-final-01', 104, 'final', null, '2026-07-19T19:00:00.000Z', '2026-07-19', '21:00', 'Sieger Halbfinale 1', 'Sieger Halbfinale 2', '', '', '', '', 'Finale')
on conflict (id) do update set
  match_number = excluded.match_number,
  phase = excluded.phase,
  kickoff_at = excluded.kickoff_at,
  match_date = excluded.match_date,
  match_time = excluded.match_time,
  team_a = excluded.team_a,
  team_b = excluded.team_b,
  status = excluded.status;
