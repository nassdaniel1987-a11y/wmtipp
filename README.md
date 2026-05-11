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

Die aktuelle Version nutzt Supabase fuer WM-Plan, QR-Codes, Teilnehmer, Tipps,
Ergebnisse und Rangliste. Der Browser merkt sich nur den aktivierten
Teilnehmer auf diesem Geraet.

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
4. In Supabase **Authentication > Users** einen Admin-User anlegen.
5. Die User-ID kopieren und im SQL Editor eintragen:

```sql
insert into public.admins (user_id, email)
values ('USER_UUID_HERE', 'deine-admin-mail@example.com')
on conflict (user_id) do update set email = excluded.email;
```

Admin/QR-Code-Erstellung und Ergebnisverwaltung laufen ueber serverseitige
Netlify Functions mit dem geheimen Supabase Service Role Key. Dieser Key darf
nicht ins Frontend und nicht ins Repository.

Netlify braucht zusaetzlich serverseitig:

```text
SUPABASE_SECRET_KEY
```

Das ist der geheime Supabase Secret/Service-Role-Key. In Netlify bei dieser
Variable **Contains secret values** aktivieren.

Vollstaendiger lokaler Backend-Test geht ueber Netlify Functions, also nicht
ueber `npm run dev`, sondern mit Netlify CLI:

```bash
netlify dev
```
