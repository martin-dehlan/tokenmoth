-- #82: distinguish where a session came from (Claude Code hook vs Claude
-- Desktop MCP server). Backwards-compatible: every existing row is a hook
-- session, and clients that omit `source` keep defaulting to it.
alter table token_logs
    add column if not exists source text not null default 'claude_code_hook';
