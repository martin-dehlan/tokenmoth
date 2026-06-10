# Homebrew formula — SOURCE OF TRUTH. release.yml fills in version + sha256 and
# pushes the rendered copy to the public tap repo (martin-dehlan/homebrew-tokenmoth),
# so users can:
#
#   brew install martin-dehlan/tokenmoth/tokenmoth
#
# The {{VERSION}} / {{SHA256_*}} placeholders are substituted in CI from the
# release artifacts. Binary-only formula (no Rust toolchain on the user's box).
class Tokenmoth < Formula
  desc "Track, aggregate and visualize Claude Code token usage & cost per Git repo"
  homepage "https://tokenmoth.com"
  version "{{VERSION}}"
  license "MIT"

  BASE = "https://get.tokenmoth.com".freeze

  on_macos do
    on_arm do
      url "#{BASE}/tokenmoth-aarch64-apple-darwin.tar.gz"
      sha256 "{{SHA256_AARCH64_APPLE_DARWIN}}"
    end
    on_intel do
      url "#{BASE}/tokenmoth-x86_64-apple-darwin.tar.gz"
      sha256 "{{SHA256_X86_64_APPLE_DARWIN}}"
    end
  end

  on_linux do
    on_arm do
      url "#{BASE}/tokenmoth-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "{{SHA256_AARCH64_UNKNOWN_LINUX_GNU}}"
    end
    on_intel do
      url "#{BASE}/tokenmoth-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "{{SHA256_X86_64_UNKNOWN_LINUX_GNU}}"
    end
  end

  def install
    bin.install "tokenmoth"
  end

  test do
    assert_match "tokenmoth", shell_output("#{bin}/tokenmoth --help")
  end
end
