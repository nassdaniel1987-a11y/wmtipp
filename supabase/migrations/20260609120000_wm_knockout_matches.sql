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
('ko-r32-01', 73, 'r32', null, '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Zweiter Gruppe A', 'Zweiter Gruppe B', '', '', 'Los-Angeles-Stadion', 'Los Angeles', 'Runde der letzten 32'),
('ko-r32-02', 74, 'r32', null, '2026-06-29T20:30:00.000Z', '2026-06-29', '22:30', 'Sieger Gruppe E', 'Dritter aus A/B/C/D/F', '', '', 'Boston-Stadion', 'Boston', 'Runde der letzten 32'),
('ko-r32-03', 75, 'r32', null, '2026-06-30T01:00:00.000Z', '2026-06-30', '03:00', 'Sieger Gruppe F', 'Zweiter Gruppe C', '', '', 'Monterrey-Stadion', 'Monterrey', 'Runde der letzten 32'),
('ko-r32-04', 76, 'r32', null, '2026-06-29T17:00:00.000Z', '2026-06-29', '19:00', 'Sieger Gruppe C', 'Zweiter Gruppe F', '', '', 'Houston-Stadion', 'Houston', 'Runde der letzten 32'),
('ko-r32-05', 77, 'r32', null, '2026-06-30T21:00:00.000Z', '2026-06-30', '23:00', 'Sieger Gruppe I', 'Dritter aus C/D/F/G/H', '', '', 'New-York-New-Jersey-Stadion', 'New York / New Jersey', 'Runde der letzten 32'),
('ko-r32-06', 78, 'r32', null, '2026-06-30T17:00:00.000Z', '2026-06-30', '19:00', 'Zweiter Gruppe E', 'Zweiter Gruppe I', '', '', 'Dallas-Stadion', 'Dallas', 'Runde der letzten 32'),
('ko-r32-07', 79, 'r32', null, '2026-07-01T01:00:00.000Z', '2026-07-01', '03:00', 'Sieger Gruppe A', 'Dritter aus C/E/F/H/I', '', '', 'Mexiko-Stadt-Stadion', 'Mexiko-Stadt', 'Runde der letzten 32'),
('ko-r32-08', 80, 'r32', null, '2026-07-01T16:00:00.000Z', '2026-07-01', '18:00', 'Sieger Gruppe L', 'Dritter aus E/H/I/J/K', '', '', 'Atlanta-Stadion', 'Atlanta', 'Runde der letzten 32'),
('ko-r32-09', 81, 'r32', null, '2026-07-02T00:00:00.000Z', '2026-07-02', '02:00', 'Sieger Gruppe D', 'Dritter aus B/E/F/I/J', '', '', 'San-Francisco-Bay-Area-Stadion', 'San Francisco', 'Runde der letzten 32'),
('ko-r32-10', 82, 'r32', null, '2026-07-01T20:00:00.000Z', '2026-07-01', '22:00', 'Sieger Gruppe G', 'Dritter aus A/E/H/I/J', '', '', 'Seattle-Stadion', 'Seattle', 'Runde der letzten 32'),
('ko-r32-11', 83, 'r32', null, '2026-07-02T23:00:00.000Z', '2026-07-03', '01:00', 'Zweiter Gruppe K', 'Zweiter Gruppe L', '', '', 'Toronto-Stadion', 'Toronto', 'Runde der letzten 32'),
('ko-r32-12', 84, 'r32', null, '2026-07-02T19:00:00.000Z', '2026-07-02', '21:00', 'Sieger Gruppe H', 'Zweiter Gruppe J', '', '', 'Los-Angeles-Stadion', 'Los Angeles', 'Runde der letzten 32'),
('ko-r32-13', 85, 'r32', null, '2026-07-03T03:00:00.000Z', '2026-07-03', '05:00', 'Sieger Gruppe B', 'Dritter aus E/F/G/I/J', '', '', 'BC Place Vancouver', 'Vancouver', 'Runde der letzten 32'),
('ko-r32-14', 86, 'r32', null, '2026-07-03T22:00:00.000Z', '2026-07-04', '00:00', 'Sieger Gruppe J', 'Zweiter Gruppe H', '', '', 'Miami-Stadion', 'Miami', 'Runde der letzten 32'),
('ko-r32-15', 87, 'r32', null, '2026-07-04T01:30:00.000Z', '2026-07-04', '03:30', 'Sieger Gruppe K', 'Dritter aus D/E/I/J/L', '', '', 'Kansas-City-Stadion', 'Kansas City', 'Runde der letzten 32'),
('ko-r32-16', 88, 'r32', null, '2026-07-03T18:00:00.000Z', '2026-07-03', '20:00', 'Zweiter Gruppe D', 'Zweiter Gruppe G', '', '', 'Dallas-Stadion', 'Dallas', 'Runde der letzten 32'),
('ko-r16-01', 89, 'r16', null, '2026-07-04T21:00:00.000Z', '2026-07-04', '23:00', 'Sieger Spiel 74', 'Sieger Spiel 77', '', '', 'Philadelphia-Stadion', 'Philadelphia', 'Achtelfinale'),
('ko-r16-02', 90, 'r16', null, '2026-07-04T17:00:00.000Z', '2026-07-04', '19:00', 'Sieger Spiel 73', 'Sieger Spiel 75', '', '', 'Houston-Stadion', 'Houston', 'Achtelfinale'),
('ko-r16-03', 91, 'r16', null, '2026-07-05T20:00:00.000Z', '2026-07-05', '22:00', 'Sieger Spiel 76', 'Sieger Spiel 78', '', '', 'New-York-New-Jersey-Stadion', 'New York / New Jersey', 'Achtelfinale'),
('ko-r16-04', 92, 'r16', null, '2026-07-06T00:00:00.000Z', '2026-07-06', '02:00', 'Sieger Spiel 79', 'Sieger Spiel 80', '', '', 'Mexiko-Stadt-Stadion', 'Mexiko-Stadt', 'Achtelfinale'),
('ko-r16-05', 93, 'r16', null, '2026-07-06T19:00:00.000Z', '2026-07-06', '21:00', 'Sieger Spiel 83', 'Sieger Spiel 84', '', '', 'Dallas-Stadion', 'Dallas', 'Achtelfinale'),
('ko-r16-06', 94, 'r16', null, '2026-07-07T00:00:00.000Z', '2026-07-07', '02:00', 'Sieger Spiel 81', 'Sieger Spiel 82', '', '', 'Seattle-Stadion', 'Seattle', 'Achtelfinale'),
('ko-r16-07', 95, 'r16', null, '2026-07-07T16:00:00.000Z', '2026-07-07', '18:00', 'Sieger Spiel 86', 'Sieger Spiel 88', '', '', 'Atlanta-Stadion', 'Atlanta', 'Achtelfinale'),
('ko-r16-08', 96, 'r16', null, '2026-07-07T20:00:00.000Z', '2026-07-07', '22:00', 'Sieger Spiel 85', 'Sieger Spiel 87', '', '', 'BC Place Vancouver', 'Vancouver', 'Achtelfinale'),
('ko-quarter-01', 97, 'quarter', null, '2026-07-09T20:00:00.000Z', '2026-07-09', '22:00', 'Sieger Spiel 89', 'Sieger Spiel 90', '', '', 'Boston-Stadion', 'Boston', 'Viertelfinale'),
('ko-quarter-02', 98, 'quarter', null, '2026-07-10T19:00:00.000Z', '2026-07-10', '21:00', 'Sieger Spiel 93', 'Sieger Spiel 94', '', '', 'Los-Angeles-Stadion', 'Los Angeles', 'Viertelfinale'),
('ko-quarter-03', 99, 'quarter', null, '2026-07-11T21:00:00.000Z', '2026-07-11', '23:00', 'Sieger Spiel 91', 'Sieger Spiel 92', '', '', 'Miami-Stadion', 'Miami', 'Viertelfinale'),
('ko-quarter-04', 100, 'quarter', null, '2026-07-12T01:00:00.000Z', '2026-07-12', '03:00', 'Sieger Spiel 95', 'Sieger Spiel 96', '', '', 'Kansas-City-Stadion', 'Kansas City', 'Viertelfinale'),
('ko-semi-01', 101, 'semi', null, '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Sieger Spiel 97', 'Sieger Spiel 98', '', '', 'Dallas-Stadion', 'Dallas', 'Halbfinale'),
('ko-semi-02', 102, 'semi', null, '2026-07-15T19:00:00.000Z', '2026-07-15', '21:00', 'Sieger Spiel 99', 'Sieger Spiel 100', '', '', 'Atlanta-Stadion', 'Atlanta', 'Halbfinale'),
('ko-third-01', 103, 'third', null, '2026-07-18T21:00:00.000Z', '2026-07-18', '23:00', 'Verlierer Spiel 101', 'Verlierer Spiel 102', '', '', 'Miami-Stadion', 'Miami', 'Spiel um Platz 3'),
('ko-final-01', 104, 'final', null, '2026-07-19T19:00:00.000Z', '2026-07-19', '21:00', 'Sieger Spiel 101', 'Sieger Spiel 102', '', '', 'New-York-New-Jersey-Stadion', 'New York / New Jersey', 'Finale')
on conflict (id) do update set
  match_number = excluded.match_number,
  phase = excluded.phase,
  kickoff_at = excluded.kickoff_at,
  match_date = excluded.match_date,
  match_time = excluded.match_time,
  team_a = excluded.team_a,
  team_b = excluded.team_b,
  venue = excluded.venue,
  city = excluded.city,
  status = excluded.status;
