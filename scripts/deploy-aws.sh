#!/usr/bin/env bash
# Deploy the TokenMoth API to AWS App Runner (image from ECR) + Supabase Postgres.
# Idempotent: safe to re-run. Everything is tagged Project=tokenmoth for isolation.
#
#   scripts/deploy-aws.sh build     # build+push the amd64 image to ECR
#   scripts/deploy-aws.sh secret    # create the Secrets Manager secret (placeholder)
#   scripts/deploy-aws.sh service   # create/update the App Runner service
#   scripts/deploy-aws.sh all       # build → service (assumes secret is populated)
#
# Prereqs: aws CLI logged in, Docker w/ buildx. DATABASE_URL etc. live ONLY in the
# Secrets Manager secret (you populate it — see `secret` below); never in this repo.
set -euo pipefail

REGION="${AWS_REGION:-eu-central-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REG="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
REPO="tokenmoth-api"
SERVICE="tokenmoth-api"
SECRET="tokenmoth/prod"
ACCESS_ROLE="tokenmoth-apprunner-ecr-access"
TAG="Key=Project,Value=tokenmoth"

build() {
  aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$REPO" --region "$REGION" --tags "$TAG"
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REG"
  docker buildx build --platform linux/amd64 -t "$REG/$REPO:latest" --push .
}

secret() {
  # Create the secret with placeholders if absent. POPULATE IT YOURSELF (see README):
  #   aws secretsmanager put-secret-value --secret-id tokenmoth/prod --secret-string '{...}'
  if ! aws secretsmanager describe-secret --secret-id "$SECRET" --region "$REGION" >/dev/null 2>&1; then
    aws secretsmanager create-secret --name "$SECRET" --region "$REGION" \
      --description "TokenMoth App Runner runtime secrets" --tags "$TAG" \
      --secret-string '{"DATABASE_URL":"<set-me>","SUPABASE_JWT_SECRET":"<set-me>","TOKENMOTH_ADMIN_TOKEN":"<set-me>"}'
  fi
  aws secretsmanager describe-secret --secret-id "$SECRET" --region "$REGION" --query ARN --output text
}

ensure_access_role() {
  if ! aws iam get-role --role-name "$ACCESS_ROLE" >/dev/null 2>&1; then
    aws iam create-role --role-name "$ACCESS_ROLE" --tags "$TAG" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    aws iam attach-role-policy --role-name "$ACCESS_ROLE" \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
  fi
  aws iam get-role --role-name "$ACCESS_ROLE" --query Role.Arn --output text
}

service() {
  local secret_arn access_arn
  secret_arn="$(secret)"
  access_arn="$(ensure_access_role)"
  local cfg
  cfg=$(cat <<JSON
{
  "ServiceName": "$SERVICE",
  "SourceConfiguration": {
    "AuthenticationConfiguration": { "AccessRoleArn": "$access_arn" },
    "AutoDeploymentsEnabled": false,
    "ImageRepository": {
      "ImageIdentifier": "$REG/$REPO:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {
          "BIND_ADDR": "0.0.0.0:8080",
          "RUST_LOG": "tokenmoth_api=info,tower_http=info",
          "TOKENMOTH_RATE_PER_MIN": "120"
        },
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URL": "$secret_arn:DATABASE_URL::",
          "SUPABASE_JWT_SECRET": "$secret_arn:SUPABASE_JWT_SECRET::",
          "TOKENMOTH_ADMIN_TOKEN": "$secret_arn:TOKENMOTH_ADMIN_TOKEN::"
        }
      }
    }
  },
  "InstanceConfiguration": { "Cpu": "256", "Memory": "512" },
  "HealthCheckConfiguration": { "Protocol": "HTTP", "Path": "/health", "Interval": 10, "Timeout": 5, "HealthyThreshold": 1, "UnhealthyThreshold": 5 },
  "Tags": [ { "Key": "Project", "Value": "tokenmoth" } ]
}
JSON
)
  local arn
  arn="$(aws apprunner list-services --region "$REGION" \
    --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn" --output text)"
  if [ -z "$arn" ]; then
    echo "$cfg" | aws apprunner create-service --region "$REGION" --cli-input-json file:///dev/stdin
  else
    echo "service exists ($arn) — triggering a new deployment with the latest image"
    aws apprunner start-deployment --service-arn "$arn" --region "$REGION"
  fi
}

case "${1:-all}" in
  build) build ;;
  secret) secret ;;
  service) service ;;
  all) build; service ;;
  *) echo "usage: $0 {build|secret|service|all}" >&2; exit 1 ;;
esac
