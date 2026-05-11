# WM-Tippspiel

Klickbarer Prototyp fuer ein WM-Tippspiel einer Ganztagsschule.

## Lokal starten

```bash
npm install
npm run dev
```

Demo-Link:

```text
http://127.0.0.1:5173/?code=DEMO-001
```

## Netlify

- Build command: `npm run build`
- Publish directory: `dist`

Die erste Version nutzt lokalen Browser-Speicher und noch keine echte Datenbank.

## Supabase

Lokale Variablen stehen in `.env.local`. Fuer Netlify muessen dieselben Werte
unter **Site configuration > Environment variables** angelegt werden:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Datenbank vorbereiten:

1. In Supabase **SQL Editor** oeffnen.
2. `supabase/schema.sql` ausfuehren.
3. Danach `supabase/seed_matches.sql` ausfuehren.

Admin/QR-Code-Erstellung und Ergebnisverwaltung brauchen spaeter serverseitige
Netlify Functions mit dem geheimen Supabase Service Role Key. Dieser Key darf
nicht ins Frontend und nicht ins Repository.
