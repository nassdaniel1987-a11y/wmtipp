# WM-Tippspiel Österfeld-Edition

Klickbarer Prototyp für ein WM-Tippspiel einer Ganztagsschule.

## Lokal starten

```bash
npm install
npm run dev
```

Demo-Link:

```text
http://127.0.0.1:5173/?code=DEMO-001
```

Testmodus ohne Datenbank-Änderungen:

```text
http://127.0.0.1:5173/?test=1#start
```

Der Testmodus legt lokal einen Beispielteilnehmer an und prüft sichtbar:
Spielpunkte, Bonuspunkte, Gesamtpunkte, Schnitt und Rangliste.

Automatischer Smoke-Test:

```bash
npm run test:smoke
```

Falls `npm` lokal hakt, geht auch:

```bash
node node_modules\@playwright\test\cli.js test tests/smoke.spec.js
```

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`

Die aktuelle Version nutzt Supabase für WM-Plan, QR-Codes, Teilnehmer, Tipps,
Ergebnisse und Rangliste. Der Browser merkt sich nur den aktivierten
Teilnehmer auf diesem Gerät.

## Supabase

Lokale Variablen stehen in `.env.local`. Für Netlify müssen dieselben Werte
unter **Site configuration > Environment variables** angelegt werden:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Datenbank vorbereiten:

1. In Supabase **SQL Editor** öffnen.
2. `supabase/schema.sql` ausführen.
3. Danach `supabase/seed_matches.sql` ausführen.
4. In Supabase **Authentication > Users** einen Admin-User anlegen.
5. Die User-ID kopieren und im SQL Editor eintragen:

```sql
insert into public.admins (user_id, email)
values ('USER_UUID_HERE', 'deine-admin-mail@example.com')
on conflict (user_id) do update set email = excluded.email;
```

Admin/QR-Code-Erstellung und Ergebnisverwaltung laufen über serverseitige
Netlify Functions mit dem geheimen Supabase Service Role Key. Dieser Key darf
nicht ins Frontend und nicht ins Repository.

Netlify braucht zusätzlich serverseitig:

```text
SUPABASE_SECRET_KEY
```

Das ist der geheime Supabase Secret/Service-Role-Key. In Netlify bei dieser
Variable **Contains secret values** aktivieren.

Für den halbautomatischen Ergebnis-Abruf im Adminbereich kann zusätzlich ein
API-Key von football-data.org eingetragen werden:

```text
FOOTBALL_DATA_API_KEY
FOOTBALL_DATA_COMPETITION=WC
FOOTBALL_DATA_SEASON=2026
```

Ohne `FOOTBALL_DATA_API_KEY` bleibt die manuelle Ergebnis-Eingabe normal nutzbar;
der Abruf-Button zeigt dann nur eine passende Fehlermeldung.

Vollständiger lokaler Backend-Test geht über Netlify Functions, also nicht
über `npm run dev`, sondern mit Netlify CLI:

```bash
netlify dev
```
