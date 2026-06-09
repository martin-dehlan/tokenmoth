-- #80: estimated hook/plugin context overhead tokens per session (SessionStart
-- plugins, MCP injections, PreToolUse hooks). Estimated by the CLI from the
-- transcript's attachment content (~4 chars/token). Defaults 0 for old rows.
alter table token_logs
    add column if not exists hook_overhead_tokens bigint not null default 0;
