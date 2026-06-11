-- #152 Cost Anatomy: per-turn usage + measured session baseline.
-- All values are numeric token counts extracted locally by the CLI — never
-- message content, tool arguments, or paths (privacy invariant, see CLI).
--
-- baseline_tokens: context size of the session's FIRST API call
--   (input + cache_read + cache_creation) ≈ system prompt + tool/MCP schemas
--   + hooks. Measured, not estimated — this is what every turn re-reads.
-- turn_count: real number of API calls in the session.
-- turn_usage: [[input, cache_read, cache_creation, output], ...] per API call,
--   mean-downsampled to ≤360 points for very long sessions (curve shape only;
--   sums come from the session's stored totals).
alter table token_logs
    add column if not exists baseline_tokens bigint not null default 0,
    add column if not exists turn_count bigint not null default 0,
    add column if not exists turn_usage jsonb not null default '[]'::jsonb;

-- #153 Dead MCP detection: invocation counts per MCP server, parsed from the
-- transcript's tool_use names (`mcp__<server>__<tool>` → server segment only,
-- never the tool name or its input). Complements mcp_servers (loaded list).
-- Rows with turn_count = 0 predate this CLI version — their '{}' means
-- "unknown", not "never called"; aggregates must filter on turn_count > 0.
alter table token_logs
    add column if not exists mcp_calls jsonb not null default '{}'::jsonb;
