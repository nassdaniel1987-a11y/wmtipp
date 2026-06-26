-- WM 2026 K.o.-Phase: offizielle Matchtermine nachziehen.
-- match_date/match_time sind Deutschland-Anzeigezeiten (MESZ / Europe-Berlin).
-- kickoff_at bleibt die absolute UTC-Zeit fuer Tipplocks.

update public.matches as m
set
  kickoff_at = v.kickoff_at::timestamptz,
  match_date = v.match_date::date,
  match_time = v.match_time,
  venue = v.venue,
  city = v.city
from (values
  ('ko-r32-01', '2026-06-28T19:00:00.000Z', '2026-06-28', '21:00', 'Los-Angeles-Stadion', 'Los Angeles'),
  ('ko-r32-02', '2026-06-29T20:30:00.000Z', '2026-06-29', '22:30', 'Boston-Stadion', 'Boston'),
  ('ko-r32-03', '2026-06-30T01:00:00.000Z', '2026-06-30', '03:00', 'Monterrey-Stadion', 'Monterrey'),
  ('ko-r32-04', '2026-06-29T17:00:00.000Z', '2026-06-29', '19:00', 'Houston-Stadion', 'Houston'),
  ('ko-r32-05', '2026-06-30T21:00:00.000Z', '2026-06-30', '23:00', 'New-York-New-Jersey-Stadion', 'New York / New Jersey'),
  ('ko-r32-06', '2026-06-30T17:00:00.000Z', '2026-06-30', '19:00', 'Dallas-Stadion', 'Dallas'),
  ('ko-r32-07', '2026-07-01T01:00:00.000Z', '2026-07-01', '03:00', 'Mexiko-Stadt-Stadion', 'Mexiko-Stadt'),
  ('ko-r32-08', '2026-07-01T16:00:00.000Z', '2026-07-01', '18:00', 'Atlanta-Stadion', 'Atlanta'),
  ('ko-r32-09', '2026-07-02T00:00:00.000Z', '2026-07-02', '02:00', 'San-Francisco-Bay-Area-Stadion', 'San Francisco'),
  ('ko-r32-10', '2026-07-01T20:00:00.000Z', '2026-07-01', '22:00', 'Seattle-Stadion', 'Seattle'),
  ('ko-r32-11', '2026-07-02T23:00:00.000Z', '2026-07-03', '01:00', 'Toronto-Stadion', 'Toronto'),
  ('ko-r32-12', '2026-07-02T19:00:00.000Z', '2026-07-02', '21:00', 'Los-Angeles-Stadion', 'Los Angeles'),
  ('ko-r32-13', '2026-07-03T03:00:00.000Z', '2026-07-03', '05:00', 'BC Place Vancouver', 'Vancouver'),
  ('ko-r32-14', '2026-07-03T22:00:00.000Z', '2026-07-04', '00:00', 'Miami-Stadion', 'Miami'),
  ('ko-r32-15', '2026-07-04T01:30:00.000Z', '2026-07-04', '03:30', 'Kansas-City-Stadion', 'Kansas City'),
  ('ko-r32-16', '2026-07-03T18:00:00.000Z', '2026-07-03', '20:00', 'Dallas-Stadion', 'Dallas'),
  ('ko-r16-01', '2026-07-04T21:00:00.000Z', '2026-07-04', '23:00', 'Philadelphia-Stadion', 'Philadelphia'),
  ('ko-r16-02', '2026-07-04T17:00:00.000Z', '2026-07-04', '19:00', 'Houston-Stadion', 'Houston'),
  ('ko-r16-03', '2026-07-05T20:00:00.000Z', '2026-07-05', '22:00', 'New-York-New-Jersey-Stadion', 'New York / New Jersey'),
  ('ko-r16-04', '2026-07-06T00:00:00.000Z', '2026-07-06', '02:00', 'Mexiko-Stadt-Stadion', 'Mexiko-Stadt'),
  ('ko-r16-05', '2026-07-06T19:00:00.000Z', '2026-07-06', '21:00', 'Dallas-Stadion', 'Dallas'),
  ('ko-r16-06', '2026-07-07T00:00:00.000Z', '2026-07-07', '02:00', 'Seattle-Stadion', 'Seattle'),
  ('ko-r16-07', '2026-07-07T16:00:00.000Z', '2026-07-07', '18:00', 'Atlanta-Stadion', 'Atlanta'),
  ('ko-r16-08', '2026-07-07T20:00:00.000Z', '2026-07-07', '22:00', 'BC Place Vancouver', 'Vancouver'),
  ('ko-quarter-01', '2026-07-09T20:00:00.000Z', '2026-07-09', '22:00', 'Boston-Stadion', 'Boston'),
  ('ko-quarter-02', '2026-07-10T19:00:00.000Z', '2026-07-10', '21:00', 'Los-Angeles-Stadion', 'Los Angeles'),
  ('ko-quarter-03', '2026-07-11T21:00:00.000Z', '2026-07-11', '23:00', 'Miami-Stadion', 'Miami'),
  ('ko-quarter-04', '2026-07-12T01:00:00.000Z', '2026-07-12', '03:00', 'Kansas-City-Stadion', 'Kansas City'),
  ('ko-semi-01', '2026-07-14T19:00:00.000Z', '2026-07-14', '21:00', 'Dallas-Stadion', 'Dallas'),
  ('ko-semi-02', '2026-07-15T19:00:00.000Z', '2026-07-15', '21:00', 'Atlanta-Stadion', 'Atlanta'),
  ('ko-third-01', '2026-07-18T21:00:00.000Z', '2026-07-18', '23:00', 'Miami-Stadion', 'Miami'),
  ('ko-final-01', '2026-07-19T19:00:00.000Z', '2026-07-19', '21:00', 'New-York-New-Jersey-Stadion', 'New York / New Jersey')
) as v(id, kickoff_at, match_date, match_time, venue, city)
where m.id = v.id;
