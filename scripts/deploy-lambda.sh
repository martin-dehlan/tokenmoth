#!/usr/bin/env bash
# Deploy the TokenMoth API to AWS Lambda (scale-to-zero) behind an API Gateway
# HTTP API (public). Idempotent. Runtime config comes from Secrets Manager.
#
#   cargo lambda build --release --arm64 --features lambda -p tokenmoth-api
#   scripts/deploy-lambda.sh
#
# Notes learned the hard way:
#   * Supabase + sqlx needs the SESSION pooler (port 5432) — the transaction
#     pooler (6543) breaks prepared statements ("sqlx_s_1 already exists").
#   * Public Lambda *Function URLs* are blocked in this org → we front with API
#     Gateway HTTP API instead.
#   * Use ${BRACES} around vars in ARNs (zsh treats `$VAR:func` as a modifier).
set -euo pipefail

REGION="${AWS_REGION:-eu-central-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
FN="tokenmoth-api"
SECRET="tokenmoth/prod"
FN_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:${FN}"

echo "→ deploying Lambda (arm64)…"
cargo lambda deploy "${FN}" --memory 512 --timeout 30 --tag Project=tokenmoth --region "${REGION}"
# Wait for the CODE update to fully settle before touching config (avoids
# ResourceConflictException "update in progress").
aws lambda wait function-active --function-name "${FN}" --region "${REGION}"
aws lambda wait function-updated --function-name "${FN}" --region "${REGION}"

echo "→ injecting runtime env from ${SECRET} (secrets not printed)…"
SEC="$(aws secretsmanager get-secret-value --secret-id "${SECRET}" --region "${REGION}" --query SecretString --output text)"
TMP="$(mktemp)"
SEC="${SEC}" python3 - <<'PY' > "${TMP}"
import json, os
d = json.loads(os.environ["SEC"])
v = {
    "DATABASE_URL":            d["DATABASE_URL"],            # Supabase SESSION pooler :5432
    "SUPABASE_JWT_SECRET":     d["SUPABASE_JWT_SECRET"],
    "SUPABASE_URL":            "https://your-project-ref.supabase.co",  # for JWKS (ES256)
    "POSTHOG_KEY":             d.get("POSTHOG_KEY", ""),     # optional: server-side analytics (#26)
    "POSTHOG_HOST":            d.get("POSTHOG_HOST", "https://eu.i.posthog.com"),
    "TOKENMOTH_ADMIN_TOKEN":   d["TOKENMOTH_ADMIN_TOKEN"],
    "TOKENMOTH_RATE_PER_MIN":  "120",
    # 2 conns/container lets the dashboard's try_join! queries actually run in
    # parallel; 6 reserved containers x 2 = 12, under the session pooler's 15.
    "TOKENMOTH_DB_MAX_CONN":   "2",
    "RUST_LOG":                "tokenmoth_api=info",
}
# Single-user bootstrap (self-seeded API key on startup) is a dev/docker-compose
# convenience. The API skips it when the env var is unset, so prod only enables
# it if TOKENMOTH_BOOTSTRAP_KEY is explicitly stored in Secrets Manager — never
# hardcode a value here: it becomes a valid production API key.
if d.get("TOKENMOTH_BOOTSTRAP_KEY"):
    v["TOKENMOTH_BOOTSTRAP_KEY"] = d["TOKENMOTH_BOOTSTRAP_KEY"]
print(json.dumps({"Variables": v}))
PY
aws lambda update-function-configuration --function-name "${FN}" --region "${REGION}" \
  --environment "file://${TMP}" >/dev/null
rm -f "${TMP}"
aws lambda wait function-updated --function-name "${FN}" --region "${REGION}"

# Hard-bound concurrent containers so (containers × pool max_connections) stays
# under the Supabase session-pooler 15-client cap (avoids EMAXCONNSESSION 500s).
echo "→ setting reserved concurrency = 6 (best-effort; account may forbid)…"
aws lambda put-function-concurrency --function-name "${FN}" --region "${REGION}" \
  --reserved-concurrent-executions 6 >/dev/null 2>&1 \
  || echo "  (skipped — account concurrency limit; relying on max_connections=1)"

echo "→ ensuring API Gateway HTTP API…"
API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" \
  --query "Items[?Name=='${FN}'].ApiId | [0]" --output text)"
if [ "${API_ID}" = "None" ] || [ -z "${API_ID}" ]; then
  API_ID="$(aws apigatewayv2 create-api --name "${FN}" --protocol-type HTTP \
    --target "${FN_ARN}" --tags Project=tokenmoth --region "${REGION}" \
    --query ApiId --output text)"
fi
# Allow ONLY this API Gateway (this account/region/api-id) to invoke the
# function — without --source-arn, any AWS account's gateway could invoke it.
# Drop the legacy unscoped grant first if it's still attached.
aws lambda remove-permission --function-name "${FN}" --region "${REGION}" \
  --statement-id apigw-open >/dev/null 2>&1 || true
aws lambda add-permission --function-name "${FN}" --region "${REGION}" \
  --statement-id apigw-invoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/*/*" \
  >/dev/null 2>&1 || true
# Make sure the proxy integration points at the correct (brace-safe) ARN.
INT_ID="$(aws apigatewayv2 get-integrations --api-id "${API_ID}" --region "${REGION}" \
  --query 'Items[0].IntegrationId' --output text)"
aws apigatewayv2 update-integration --api-id "${API_ID}" --integration-id "${INT_ID}" \
  --region "${REGION}" --integration-uri "${FN_ARN}" --payload-format-version 2.0 >/dev/null

# Keep one container warm: scale-to-zero means every idle gap costs the next
# user a ~600ms init + DB connect. EventBridge Scheduler pings /health every
# 4 minutes (idempotent create-or-update; role is scoped to this function).
echo "→ ensuring warm-keeper schedule…"
WARM_ROLE="tokenmoth-warm-scheduler"
WARM_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${WARM_ROLE}"
aws iam get-role --role-name "${WARM_ROLE}" >/dev/null 2>&1 || {
  aws iam create-role --role-name "${WARM_ROLE}" --tags Key=Project,Value=tokenmoth \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam put-role-policy --role-name "${WARM_ROLE}" --policy-name invoke-tokenmoth-api \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"${FN_ARN}\"}]}"
  sleep 8  # IAM propagation before the schedule references the role
}
WARM_INPUT='{"version":"2.0","routeKey":"GET /health","rawPath":"/health","rawQueryString":"","headers":{"host":"warm.internal"},"requestContext":{"accountId":"warm","apiId":"warm","domainName":"warm.internal","http":{"method":"GET","path":"/health","protocol":"HTTP/1.1","sourceIp":"127.0.0.1","userAgent":"tokenmoth-warmer"},"requestId":"warm","routeKey":"GET /health","stage":"$default","time":"01/Jan/2026:00:00:00 +0000","timeEpoch":0},"isBase64Encoded":false}'
if aws scheduler get-schedule --name tokenmoth-api-warm --region "${REGION}" >/dev/null 2>&1; then
  aws scheduler update-schedule --name tokenmoth-api-warm --region "${REGION}" \
    --schedule-expression "rate(4 minutes)" --flexible-time-window Mode=OFF \
    --target "{\"Arn\":\"${FN_ARN}\",\"RoleArn\":\"${WARM_ROLE_ARN}\",\"Input\":$(printf '%s' "${WARM_INPUT}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" >/dev/null
else
  aws scheduler create-schedule --name tokenmoth-api-warm --region "${REGION}" \
    --schedule-expression "rate(4 minutes)" --flexible-time-window Mode=OFF \
    --target "{\"Arn\":\"${FN_ARN}\",\"RoleArn\":\"${WARM_ROLE_ARN}\",\"Input\":$(printf '%s' "${WARM_INPUT}" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" >/dev/null
fi

ENDPOINT="$(aws apigatewayv2 get-api --api-id "${API_ID}" --region "${REGION}" --query ApiEndpoint --output text)"
echo "✓ deployed. Public API: ${ENDPOINT}"
echo "  health: $(curl -fs "${ENDPOINT}/health" || echo FAILED)"
echo "  point the hook here:  tokenmoth setup --key <key> --api-url ${ENDPOINT}"
