-- Adds the AI-generated "how to play against this team" plan to game_patterns.
-- Run this in the Supabase dashboard: SQL Editor -> paste -> Run.
-- The app works without it (the game plan just won't be saved to History).

alter table game_patterns add column if not exists game_plan jsonb;
