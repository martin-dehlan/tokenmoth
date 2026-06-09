-- #83 Phase 2: per-hook overhead attribution, keyed by hookName.
-- JSON object { "<hookName>": <estimated tokens> } per session. Defaults '{}'.
alter table token_logs
    add column if not exists hook_overhead_breakdown jsonb not null default '{}'::jsonb;
