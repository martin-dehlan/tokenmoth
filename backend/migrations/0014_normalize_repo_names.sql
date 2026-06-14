-- #217: drive/filesystem roots and path-like strings leaked into `repo`.
-- A session launched from a non-repo parent (e.g. `D:\`) was bucketed under
-- that root ("D:\"), collapsing unrelated work — and on Windows the path
-- separator wasn't even stripped. The CLI and the ingest path now reject such
-- values, but existing rows must be consolidated.
--
-- The original project can't be recovered here: `project_path` mirrors the same
-- (already-reduced) basename, so there is no absolute path to re-derive from.
-- Relabel the offending rows to 'unknown' — the honest label — merging the
-- bogus buckets into one. New rows are attributed correctly by the updated CLI.
update token_logs
   set repo = 'unknown',
       project_path = 'unknown'
 where position('/' in repo) > 0    -- contains a POSIX separator
    or position('\' in repo) > 0    -- contains a Windows separator
    or repo like '_:'               -- bare drive letter, e.g. C: / D:
    or repo in ('.', '..', '~', '');
