-- Audit: dashboard/trends queries filter by (user_id, ended_at) and
-- (user_id, repo, ended_at); the 0001 indexes don't cover those shapes.
create index if not exists idx_token_logs_user_ended on token_logs (user_id, ended_at desc);
create index if not exists idx_token_logs_user_repo_ended on token_logs (user_id, repo, ended_at desc);
-- Superseded by the composite indexes above (names from 0001_init.sql).
drop index if exists idx_token_logs_user_repo;
drop index if exists idx_token_logs_ended_at;
