-- Per-model token attribution (#model-breakdown). The single `model` column is
-- only "last seen" per session, so a session that used several models — e.g. a
-- quick Fable detour inside an Opus session — hid every model but the last, and
-- its tokens were mis-attributed. model_usage carries the real per-model split:
--   { "<model>": [input, cache_read, cache_creation, output] }
-- Same component order as turn_usage. Names + counts only, never content.
alter table token_logs
    add column if not exists model_usage jsonb not null default '{}'::jsonb;
