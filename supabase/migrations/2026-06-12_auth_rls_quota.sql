-- =============================================================================
-- Auth + Row Level Security migration
-- Run this in the Supabase dashboard: SQL Editor -> paste everything -> Run.
--
-- BEFORE RUNNING: replace YOUR_EMAIL_HERE near the bottom with the email of
-- the account you create for yourself (Authentication -> Users -> Add user).
--
-- ALSO: in Authentication -> Sign In / Up, turn OFF "Allow new users to sign
-- up" — accounts are invite-only and created by you in the dashboard.
-- =============================================================================

-- 1. Ownership columns ---------------------------------------------------------
alter table videos  add column if not exists user_id uuid references auth.users(id);
alter table folders add column if not exists user_id uuid references auth.users(id);

-- From the earlier game-plan migration, in case it wasn't run:
alter table game_patterns add column if not exists game_plan jsonb;

-- 2. Access requests from the landing page -------------------------------------
create table if not exists access_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- 3. Enable Row Level Security --------------------------------------------------
alter table videos          enable row level security;
alter table folders         enable row level security;
alter table sequences       enable row level security;
alter table possessions     enable row level security;
alter table analyses        enable row level security;
alter table game_patterns   enable row level security;
alter table player_reports  enable row level security;
alter table access_requests enable row level security;

-- 4. Policies -------------------------------------------------------------------
-- Owners can do everything with their own videos/folders.
drop policy if exists "videos_owner_all" on videos;
create policy "videos_owner_all" on videos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "folders_owner_all" on folders;
create policy "folders_owner_all" on folders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child tables: access flows through ownership of the parent video.
drop policy if exists "sequences_via_video" on sequences;
create policy "sequences_via_video" on sequences
  for all using (exists (select 1 from videos v where v.id = sequences.video_id and v.user_id = auth.uid()));

drop policy if exists "possessions_via_video" on possessions;
create policy "possessions_via_video" on possessions
  for all using (exists (select 1 from videos v where v.id = possessions.video_id and v.user_id = auth.uid()));

drop policy if exists "analyses_via_video" on analyses;
create policy "analyses_via_video" on analyses
  for all using (exists (select 1 from videos v where v.id = analyses.video_id and v.user_id = auth.uid()));

drop policy if exists "game_patterns_via_video" on game_patterns;
create policy "game_patterns_via_video" on game_patterns
  for all using (exists (select 1 from videos v where v.id = game_patterns.video_id and v.user_id = auth.uid()));

drop policy if exists "player_reports_via_video" on player_reports;
create policy "player_reports_via_video" on player_reports
  for all using (exists (select 1 from videos v where v.id = player_reports.video_id and v.user_id = auth.uid()));

-- access_requests: nobody reads/writes via the anon key — the API route uses
-- the service role. No policies means RLS blocks all client access. Good.

-- 5. Claim your existing data ---------------------------------------------------
-- Assigns every pre-auth video and folder to your account so History keeps
-- working. REPLACE the email below first!
update videos  set user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE') where user_id is null;
update folders set user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE') where user_id is null;
