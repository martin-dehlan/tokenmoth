-- #106: per-session list of active MCP server names. The tool-schema token cost
-- isn't separately measurable (it's already inside the session totals); this just
-- records *which* MCP servers were loaded. JSON array of names, defaults '[]'.
alter table token_logs
    add column if not exists mcp_servers jsonb not null default '[]'::jsonb;
