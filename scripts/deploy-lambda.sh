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
print(json.dumps({"Variables": {
    "DATABASE_URL":            d["DATABASE_URL"],            # Supabase SESSION pooler :5432
    "SUPABASE_JWT_SECRET":     d["SUPABASE_JWT_SECRET"],
    "SUPABASE_URL":            "https://htrizluzxopbizyrfwhg.supabase.co",  # for JWKS (ES256)
    "TOKENMOTH_ADMIN_TOKEN":   d["TOKENMOTH_ADMIN_TOKEN"],
    "TOKENMOTH_BOOTSTRAP_KEY": "tm_user_123",
    "TOKENMOTH_RATE_PER_MIN":  "120",
    "RUST_LOG":                "tokenmoth_api=info",
}}))
PY
aws lambda update-function-configuration --function-name "${FN}" --region "${REGION}" \
  --environment "file://${TMP}" >/dev/null
rm -f "${TMP}"
aws lambda wait function-updated --function-name "${FN}" --region "${REGION}"

echo "→ ensuring API Gateway HTTP API…"
API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" \
  --query "Items[?Name=='${FN}'].ApiId | [0]" --output text)"
if [ "${API_ID}" = "None" ] || [ -z "${API_ID}" ]; then
  API_ID="$(aws apigatewayv2 create-api --name "${FN}" --protocol-type HTTP \
    --target "${FN_ARN}" --tags Project=tokenmoth --region "${REGION}" \
    --query ApiId --output text)"
fi
# Allow API Gateway to invoke the function (broad principal; no source-arn pitfalls).
aws lambda add-permission --function-name "${FN}" --region "${REGION}" \
  --statement-id apigw-open --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com >/dev/null 2>&1 || true
# Make sure the proxy integration points at the correct (brace-safe) ARN.
INT_ID="$(aws apigatewayv2 get-integrations --api-id "${API_ID}" --region "${REGION}" \
  --query 'Items[0].IntegrationId' --output text)"
aws apigatewayv2 update-integration --api-id "${API_ID}" --integration-id "${INT_ID}" \
  --region "${REGION}" --integration-uri "${FN_ARN}" --payload-format-version 2.0 >/dev/null

ENDPOINT="$(aws apigatewayv2 get-api --api-id "${API_ID}" --region "${REGION}" --query ApiEndpoint --output text)"
echo "✓ deployed. Public API: ${ENDPOINT}"
echo "  health: $(curl -fs "${ENDPOINT}/health" || echo FAILED)"
echo "  point the hook here:  tokenmoth setup --key <key> --api-url ${ENDPOINT}"
