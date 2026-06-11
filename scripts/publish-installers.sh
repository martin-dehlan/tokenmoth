#!/usr/bin/env sh
# Publish the public installer scripts to the dist bucket.
#
# The release workflow uploads the binaries (tokenmoth-<target>.tar.gz), but the
# installer entrypoints (install.sh / install.ps1) are published from here. They
# carry a short cache-control so edits propagate through CloudFront within
# minutes instead of CloudFront's 24h default.
#
# Run manually with credentials that can PutObject on tokenmoth-dist/install.*:
#   sh scripts/publish-installers.sh
#
# Env: TOKENMOTH_DIST_BUCKET (default tokenmoth-dist), AWS_REGION (default eu-central-1)
set -eu

BUCKET="${TOKENMOTH_DIST_BUCKET:-tokenmoth-dist}"
REGION="${AWS_REGION:-eu-central-1}"
CACHE="public, max-age=300, must-revalidate"
here="$(CDPATH= cd "$(dirname "$0")" && pwd)"

# install-release.sh is the public curl|sh entrypoint → served as install.sh.
aws s3 cp "$here/install-release.sh" "s3://$BUCKET/install.sh" \
  --region "$REGION" --content-type "text/x-shellscript" --cache-control "$CACHE"

aws s3 cp "$here/install.ps1" "s3://$BUCKET/install.ps1" \
  --region "$REGION" --content-type "text/plain" --cache-control "$CACHE"

echo "✓ installers published to s3://$BUCKET (cache-control: $CACHE)"
echo "  invalidate CloudFront if you need it instantly:"
echo "  aws cloudfront create-invalidation --distribution-id E7307GHF32DAD --paths '/install.sh' '/install.ps1'"
