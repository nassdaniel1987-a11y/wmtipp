-- Free Bundesliga live hybrid: internal provider observations and selected live-result provenance.
-- These structures are used only by Bundesliga server functions; WM data stays unchanged.

alter table public.competition_results
  add column if not exists live_source text check (live_source in ('openligadb', 'football-data', 'confirmed')),
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_status text check (
    verification_status in ('primary_live', 'fallback_live', 'awaiting_confirmation', 'conflict', 'confirmed', 'single_source')
  );

create table if not exists public.competition_live_observations (
  competition_id text not null references public.competitions(id) on delete cascade,
  match_id text not null references public.competition_matches(id) on delete cascade,
  provider text not null check (provider in ('openligadb', 'football-data')),
  score_a integer not null check (score_a between 0 and 30),
  score_b integer not null check (score_b between 0 and 30),
  status text not null check (status in ('live', 'final')),
  provider_updated_at timestamptz,
  observed_at timestamptz not null default now(),
  source_json jsonb not null default '{}'::jsonb,
  primary key (competition_id, match_id, provider)
);

create index if not exists competition_live_observations_match_idx
  on public.competition_live_observations (competition_id, match_id);

alter table public.competition_live_observations enable row level security;

-- Observations remain internal to server-side Functions using the service role.
-- No anon/authenticated grants or public policies are added.
