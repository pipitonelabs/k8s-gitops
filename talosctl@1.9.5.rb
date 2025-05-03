class TalosctlAT195 < Formula
  desc "CLI for out-of-band management of Kubernetes nodes created by Talos"
  homepage "https://www.talos.dev/"
  url "https://github.com/siderolabs/talos/releases/download/v1.9.5/talosctl-linux-amd64"
  sha256 "085b089dfd2c28dbe9489ff218abd1f6ea4ad8520c34b162d079ba5b45ccda62"
  license "MPL-2.0"

  def install
    bin.install "talosctl-linux-amd64" => "talosctl"
  end
end
