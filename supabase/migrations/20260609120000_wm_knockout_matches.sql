-- WM 2026 K.o.-Phase: Platzhalter-Spiele (R32 -> Finale + Spiel um Platz 3).
-- Generiert aus src/koBracket.js (eine Quelle der Wahrheit) und folgt dem
-- offiziellen FIFA-2026-Spielplan (Spiele 73-104).
--
-- WICHTIG: Erst ausfuehren, wenn die admin-gegatete K.o.-Ansicht deployt ist,
-- sonst sehen Teilnehmer sofort leere K.o.-Spiele.
-- team_a/team_b sind Platzhalter-Labels; sie werden beim Aufloesen der
-- Paarungen (Auto-Berechnung/Admin) mit echten Teamnamen ueberschrieben.

insert into public.matches (
  id, match_number, phase, group_key, kickoff_at, match_date, match_time,
  team_a, team_b, flag_code_a, flag_code_b, venue, city, status
) values
('ko-r32-01', 73, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe A', 'Zweiter Gruppe B', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-02', 74, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe E', 'Dritter aus A/B/C/D/F', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-03', 75, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe F', 'Zweiter Gruppe C', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-04', 76, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe C', 'Zweiter Gruppe F', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-05', 77, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe I', 'Dritter aus C/D/F/G/H', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-06', 78, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe E', 'Zweiter Gruppe I', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-07', 79, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe A', 'Dritter aus C/E/F/H/I', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-08', 80, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe L', 'Dritter aus E/H/I/J/K', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-09', 81, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe D', 'Dritter aus B/E/F/I/J', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-10', 82, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe G', 'Dritter aus A/E/H/I/J', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-11', 83, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe K', 'Zweiter Gruppe L', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-12', 84, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe H', 'Zweiter Gruppe J', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-13', 85, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe B', 'Dritter aus E/F/G/I/J', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-14', 86, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe J', 'Zweiter Gruppe H', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-15', 87, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Sieger Gruppe K', 'Dritter aus D/E/I/J/L', '', '', '', '', 'Sechzehntelfinale'),
('ko-r32-16', 88, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe D', 'Zweiter Gruppe G', '', '', '', '', 'Sechzehntelfinale'),
('ko-r16-01', 89, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 74', 'Sieger Spiel 77', '', '', '', '', 'Achtelfinale'),
('ko-r16-02', 90, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 73', 'Sieger Spiel 75', '', '', '', '', 'Achtelfinale'),
('ko-r16-03', 91, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 76', 'Sieger Spiel 78', '', '', '', '', 'Achtelfinale'),
('ko-r16-04', 92, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 79', 'Sieger Spiel 80', '', '', '', '', 'Achtelfinale'),
('ko-r16-05', 93, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 83', 'Sieger Spiel 84', '', '', '', '', 'Achtelfinale'),
('ko-r16-06', 94, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 81', 'Sieger Spiel 82', '', '', '', '', 'Achtelfinale'),
('ko-r16-07', 95, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 86', 'Sieger Spiel 88', '', '', '', '', 'Achtelfinale'),
('ko-r16-08', 96, 'r16', null, '2026-07-04T19:00:00.000Z', '2026-07-04', '21:00', 'Sieger Spiel 85', 'Sieger Spiel 87', '', '', '', '', 'Achtelfinale'),
('ko-quarter-01', 97, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Spiel 89', 'Sieger Spiel 90', '', '', '', '', 'Viertelfinale'),
('ko-quarter-02', 98, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Spiel 93', 'Sieger Spiel 94', '', '', '', '', 'Viertelfinale'),
('ko-quarter-03', 99, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Spiel 91', 'Sieger Spiel 92', '', '', '', '', 'Viertelfinale'),
('ko-quarter-04', 100, 'quarter', null, '2026-07-09T19:00:00.000Z', '2026-07-09', '21:00', 'Sieger Spiel 95', 'Sieger Spiel 96', '', '', '', '', 'Viertelfinale'),
('ko-semi-01', 101, 'semi', null, '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Sieger Spiel 97', 'Sieger Spiel 98', '', '', '', '', 'Halbfinale'),
('ko-semi-02', 102, 'semi', null, '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Sieger Spiel 99', 'Sieger Spiel 100', '', '', '', '', 'Halbfinale'),
('ko-third-01', 103, 'third', null, '2026-07-18T19:00:00.000Z', '2026-07-18', '21:00', 'Verlierer Spiel 101', 'Verlierer Spiel 102', '', '', '', '', 'Spiel um Platz 3'),
('ko-final-01', 104, 'final', null, '2026-07-19T19:00:00.000Z', '2026-07-19', '21:00', 'Sieger Spiel 101', 'Sieger Spiel 102', '', '', '', '', 'Finale')
on conflict (id) do update set
  match_number = excluded.match_number,
  phase = excluded.phase,
  kickoff_at = excluded.kickoff_at,
  match_date = excluded.match_date,
  match_time = excluded.match_time,
  team_a = excluded.team_a,
  team_b = excluded.team_b,
  status = excluded.status;
