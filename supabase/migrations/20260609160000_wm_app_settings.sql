-- WM 2026: einfache App-Settings (Key/Value) fuer globale Schalter.
-- Erster Schalter: ko_visible steuert, ob die K.o.-Phase fuer alle Teilnehmer
-- sichtbar/tippbar ist. Standard false -> bleibt zunaechst nur fuer Admins.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

grant select on public.app_settings to anon, authenticated;

drop policy if exists "app settings are readable" on public.app_settings;
create policy "app settings are readable"
on public.app_settings for select
to anon, authenticated
using (true);

-- Schreiben laeuft ausschliesslich ueber den Service-Client der Admin-Functions
-- (umgeht RLS); fuer anon/authenticated gibt es bewusst keine Write-Policy.

insert into public.app_settings (key, value)
values ('ko_visible', 'false'::jsonb)
on conflict (key) do nothing;
