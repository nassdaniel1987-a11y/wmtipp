-- WM-Tippspiel database schema for Supabase.
-- Run this once in Supabase Dashboard > SQL Editor.
-- RLS is enabled on all public tables.

create extension if not exists pgcrypto;

create table if not exists public.matches (
  id text primary key,
  match_number integer not null unique,
  phase text not null default 'group',
  group_key text,
  kickoff_at timestamptz,
  match_date date not null,
  match_time text not null,
  team_a text not null,
  team_b text not null,
  flag_code_a text not null,
  flag_code_b text not null,
  venue text not null,
  city text not null,
  status text not null default 'Gruppenspiel',
  created_at timestamptz not null default now()
);

alter table public.matches
  add column if not exists kickoff_at timestamptz;

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'free' check (status in ('free', 'claimed', 'disabled')),
  participant_id uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  invite_code_id uuid not null unique references public.invite_codes(id) on delete restrict,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invite_codes_participant_id_fkey'
  ) then
    alter table public.invite_codes
      add constraint invite_codes_participant_id_fkey
      foreign key (participant_id)
      references public.participants(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  score_a integer not null check (score_a between 0 and 12),
  score_b integer not null check (score_b between 0 and 12),
  saved_at timestamptz not null default now(),
  unique (participant_id, match_id)
);

create table if not exists public.bonus_tips (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  champion text,
  top_scorer text,
  group_winners jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

create table if not exists public.bonus_results (
  id text primary key default 'official' check (id = 'official'),
  champion text,
  top_scorer text,
  group_winners jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  match_id text primary key references public.matches(id) on delete cascade,
  score_a integer not null check (score_a between 0 and 30),
  score_b integer not null check (score_b between 0 and 30),
  status text not null default 'final' check (status in ('scheduled', 'live', 'final')),
  updated_at timestamptz not null default now()
);

create table if not exists public.participant_devices (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null check (platform in ('android')),
  notifications_enabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.push_reminders (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24h', '3h')),
  sent_at timestamptz not null default now(),
  unique (participant_id, match_id, reminder_type)
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.matches enable row level security;
alter table public.invite_codes enable row level security;
alter table public.participants enable row level security;
alter table public.tips enable row level security;
alter table public.bonus_tips enable row level security;
alter table public.bonus_results enable row level security;
alter table public.results enable row level security;
alter table public.participant_devices enable row level security;
alter table public.push_reminders enable row level security;
alter table public.admins enable row level security;

grant select on public.matches to anon, authenticated;
grant select on public.results to anon, authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.invite_codes to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, insert, update, delete on public.tips to authenticated;
grant select, insert, update, delete on public.bonus_tips to authenticated;
grant select on public.bonus_results to anon, authenticated;
grant select, insert, update, delete on public.bonus_results to authenticated;
grant select, insert, update, delete on public.results to authenticated;
grant select, insert, update, delete on public.participant_devices to authenticated;
grant select, insert, update, delete on public.push_reminders to authenticated;
grant select on public.admins to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

drop policy if exists "matches are readable" on public.matches;
create policy "matches are readable"
on public.matches for select
to anon, authenticated
using (true);

drop policy if exists "results are readable" on public.results;
create policy "results are readable"
on public.results for select
to anon, authenticated
using (true);

drop policy if exists "admins can manage matches" on public.matches;
create policy "admins can manage matches"
on public.matches for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage invite codes" on public.invite_codes;
create policy "admins can manage invite codes"
on public.invite_codes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can view participants" on public.participants;
create policy "admins can view participants"
on public.participants for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can manage results" on public.results;
create policy "admins can manage results"
on public.results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can view tips" on public.tips;
create policy "admins can view tips"
on public.tips for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can view bonus tips" on public.bonus_tips;
create policy "admins can view bonus tips"
on public.bonus_tips for select
to authenticated
using (public.is_admin());

drop policy if exists "bonus results are readable" on public.bonus_results;
create policy "bonus results are readable"
on public.bonus_results for select
to anon, authenticated
using (true);

drop policy if exists "admins can manage bonus results" on public.bonus_results;
create policy "admins can manage bonus results"
on public.bonus_results for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can view admins" on public.admins;
create policy "admins can view admins"
on public.admins for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can manage participant devices" on public.participant_devices;
create policy "admins can manage participant devices"
on public.participant_devices for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage push reminders" on public.push_reminders;
create policy "admins can manage push reminders"
on public.push_reminders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Participant QR-code actions should ideally run through Netlify Functions
-- with the Supabase secret/service role key, so users cannot enumerate codes.
-- The frontend publishable key reads only public schedule/results directly.

-- First admin setup:
-- 1. Create a user in Supabase Dashboard > Authentication > Users.
-- 2. Copy that user's UUID.
-- 3. Run this manually with your values:
--
-- insert into public.admins (user_id, email)
-- values ('USER_UUID_HERE', 'admin@example.com')
-- on conflict (user_id) do update set email = excluded.email;
