const REPO = "https://github.com/martin-dehlan/tokenmoth";
const RAW = "https://raw.githubusercontent.com/martin-dehlan/tokenmoth/main";

// get.tokenmoth.com — the public CLI dist host. Binaries live on GitHub
// Releases; this host only redirects, so the install one-liners and the
// download paths baked into already-published npm versions keep working.
const onGetHost = [{ type: "host", value: "get.tokenmoth.com" }];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/install.sh", has: onGetHost, destination: `${RAW}/scripts/install-release.sh`, permanent: false },
      { source: "/install.ps1", has: onGetHost, destination: `${RAW}/scripts/install.ps1`, permanent: false },
      // Version-pinned artifacts (npm postinstall ≤ 0.1.4 fetches releases/v<ver>/<file>).
      {
        source: "/releases/v:version/:file",
        has: onGetHost,
        destination: `${REPO}/releases/download/cli-v:version/:file`,
        permanent: false,
      },
      // Un-versioned "latest" artifacts (tokenmoth-<target>.tar.gz[.sha256]).
      {
        source: "/:file(tokenmoth-.+)",
        has: onGetHost,
        destination: `${REPO}/releases/latest/download/:file`,
        permanent: false,
      },
      { source: "/:path*", has: onGetHost, destination: "https://tokenmoth.com", permanent: false },
    ];
  },
};

export default nextConfig;
