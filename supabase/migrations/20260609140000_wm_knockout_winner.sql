-- WM 2026 K.o.-Phase: Sieger-Spalte fuer das Weiterkommen bei Remis.
--
-- Tipp-Punkte bleiben unveraendert nach 90-Min-Ergebnis (4/3/2/0). Diese Spalte
-- entscheidet NUR, wer bei einem K.o.-Remis (Elfmeterschiessen) weiterkommt, und
-- wird von src/koBracket.js (determineOutcome) als result.winner gelesen.
-- Fuer Gruppenspiele und K.o.-Spiele mit Sieger nach 90 Minuten bleibt sie null.

alter table public.results
  add column if not exists winner text
  check (winner in ('A', 'B'));

alter table public.wm_test_results
  add column if not exists winner text
  check (winner in ('A', 'B'));
