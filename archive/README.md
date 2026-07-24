# Archiv

Die WM 2026 ist abgeschlossen. Die öffentliche Haupt-App ist jetzt die
**Bundesliga**. Das WM-Tippspiel bleibt erhalten, aber nur noch in zwei Formen:

- **Read-only Rückblick** unter der Route `#wm-archiv` (`src/WmArchiveApp.jsx`):
  zeigt Endstand der Rangliste und Ergebnisse. Keine Tipp-/Speicher-Interaktion.
- **Admin/Archiv** unter `#admin`: die WM-Verwaltung bleibt im Adminbereich
  erreichbar (jetzt als „WM-Archiv"), Bundesliga ist der Standard-Wettbewerb.

## Was hier liegt

`archive/wm/` enthält die rein interaktiven WM-Bausteine, die aus dem aktiven
Build genommen wurden, weil die WM-Teilnehmeroberfläche nicht mehr der öffentliche
Standard ist:

- `KnockoutSimulator.jsx` – die WM-K.o.-Simulation (früher Tab „Simulation").
- `koBracket.js`, `fifaAnnexC.js` – Bracket-/Auslosungslogik der K.o.-Runden.
- `tests/ko-bracket.test.js` – Unit-Tests der Bracket-Logik.
- `tests/ko-simulation.spec.js` – E2E-Test der (entfernten) Simulations-UI.

Diese Dateien werden weder gebaut, gelintet noch von den regulären Test-Skripten
ausgeführt. Sie bleiben als Referenz erhalten und lassen sich per `git`-Historie
jederzeit rekonstruieren.

## Was bewusst NICHT archiviert wurde

Der **Lese-Datenpfad** der WM bleibt im Build, damit der Rückblick echte Daten
zeigt: die Netlify-Functions `ranking.js`, `results.js`, `matches.js`, die
`_shared/wm-scoring.js`-Logik sowie `src/lib/scoring.js`/`src/lib/format.js`.

Ebenso bleibt der **Admin** (`src/admin.jsx`) inklusive der geteilten
WM-Bausteine (`src/lib/wm.js`, `src/components/wm.jsx`, `src/lib/koManualPairing.js`)
in `src/`, da er WM- und Bundesliga-Verwaltung gemeinsam trägt.

## WM wieder aktivieren

Falls das WM-Tippspiel je wieder öffentliche Haupt-App werden soll:

1. `getActiveSurface()` in `src/App.jsx` zurückdrehen (Default nicht mehr auf
   `bundesliga`, sondern WM-Shell zeigen).
2. `competitions.wm2026.publicEnabled` / `competitions.bundesliga.publicEnabled`
   in `src/lib/constants.js` entsprechend setzen.
3. Bei Bedarf die Dateien aus `archive/wm/` zurück nach `src/` bzw. `tests/`
   verschieben und die Import-Pfade wieder anpassen.
