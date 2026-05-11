-- Bonus-Tipps fuer Weltmeister, Torschuetzenkoenig und Gruppensieger.
-- In Supabase Dashboard > SQL Editor ausfuehren.

create table if not exists public.bonus_tips (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  champion text,
  top_scorer text,
  group_winners jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now()
);

alter table public.bonus_tips enable row level security;

grant select, insert, update, delete on public.bonus_tips to authenticated;

drop policy if exists "admins can view bonus tips" on public.bonus_tips;
create policy "admins can view bonus tips"
on public.bonus_tips for select
to authenticated
using (public.is_admin());
