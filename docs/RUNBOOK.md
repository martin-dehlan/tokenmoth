# TokenMoth — Portability & Account-Cutover Runbook

How to move TokenMoth to another AWS and/or Supabase account with no data loss.
Everything is reproducible; the only stateful pieces are the **Supabase Postgres**
(users, api_keys, token_logs) and the **runtime secret**.

## What lives where

| Piece | Location | Portable how |
|---|---|---|
| Schema + data | Supabase Postgres | `scripts/db-dump.sh` / `db-restore.sh` |
| Runtime secrets | AWS Secrets Manager `tokenmoth/prod` | recreated by operator (never in repo) |
| API | AWS Lambda + API Gateway | `scripts/deploy-lambda.sh` (rebuild from source) |
| Dashboard | AWS Amplify | connect repo + set env (see `amplify.yml`) |
| CLI binaries | public S3 `tokenmoth-dist` | `scripts/` build + upload |
| DNS | Namecheap (api/app.tokenmoth.com) | CNAME → new API GW / Amplify |

## Cutover steps

1. **Dump the data**
   ```sh
   scripts/db-dump.sh tokenmoth.sql        # reads DATABASE_URL from the secret
   ```

2. **Stand up the destination Supabase**
   - Create the project. Note the **session pooler** URL (`:5432`, NOT 6543).
   - Restore:
     ```sh
     TOKENMOTH_TARGET_DB_URL='postgresql://…pooler…:5432/postgres' scripts/db-restore.sh tokenmoth.sql
     ```
   - Auth: set the same OAuth providers (Google) + URL config (Site URL / Redirect =
     `https://app.tokenmoth.com`). JWTs are ES256 → no secret to copy; the backend
     reads the new project's JWKS via `SUPABASE_URL`.

3. **Recreate the runtime secret** in the destination AWS account
   ```sh
   scripts/deploy-aws.sh secret
   aws secretsmanager put-secret-value --secret-id tokenmoth/prod --region <region> \
     --secret-string '{ "DATABASE_URL": "…:5432…", "SUPABASE_JWT_SECRET": "…", "TOKENMOTH_ADMIN_TOKEN": "…" }'
   ```
   (`SUPABASE_URL` is injected by `deploy-lambda.sh`; update its value if the ref changes.)

4. **Deploy the API**
   ```sh
   cd backend && cargo lambda build --release --arm64 --features lambda -p tokenmoth-api && cd ..
   scripts/deploy-lambda.sh         # prints the new API Gateway URL
   ```

5. **Deploy the dashboard** — connect the repo in Amplify, set env
   (`TOKENMOTH_API_URL`, `NEXT_PUBLIC_TOKENMOTH_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`); `amplify.yml` bakes them into `.env.production`.

6. **Repoint DNS** — `api.tokenmoth.com` CNAME → new API GW domain; `app.tokenmoth.com`
   → new Amplify. Re-add the ACM cert-verify CNAMEs.

7. **Verify**
   ```sh
   curl https://api.tokenmoth.com/health           # ok
   curl -o /dev/null -w '%{http_code}' https://api.tokenmoth.com/v1/repos   # 401 (JWT-gated)
   ```
   Log in on `app.tokenmoth.com`, confirm data + a fresh session lands.

## Notes
- The session pooler (`:5432`) is mandatory — the transaction pooler (6543) breaks
  sqlx prepared statements on Lambda.
- API keys (`api_keys.key`) survive the dump, so installed CLI hooks keep working
  after cutover (same key, repoint only if the API URL changes).

## CI release role (IAM, manual — not codified)

`release.yml` assumes `arn:aws:iam::551504153648:role/tokenmoth-ci-s3-publish`
via OIDC. Its inline policy `s3-put-cli-tarballs` must allow `s3:PutObject` on
BOTH artifact paths the workflow writes (versioned + un-versioned fallback):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": [
      "arn:aws:s3:::tokenmoth-dist/tokenmoth-*.tar.gz*",
      "arn:aws:s3:::tokenmoth-dist/releases/v*/tokenmoth-*.tar.gz*"
    ]
  }]
}
```

Set with `aws iam put-role-policy --role-name tokenmoth-ci-s3-publish
--policy-name s3-put-cli-tarballs --policy-document '<json>'`. The v0.1.2
release (2026-06-12) failed with AccessDenied because the `releases/v*` path
was missing here. The trailing `*` after `.tar.gz` covers the `.sha256`
checksum files (second v0.1.2 failure). If `release.yml` ever writes new
paths, update this policy.
