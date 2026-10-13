#!/bin/sh
# Builds the release archives into dist/: the same pure plugin for every
# platform, a .zip for Windows and a .tar.gz for the rest, each holding one
# folder named hls-player with gmx-plugin.toml at its top.
#
#   tools/package.sh            reads the version from gmx-plugin.toml
#   tools/package.sh 1.0.0      and refuses if the manifest says otherwise
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/^version = "\(.*\)"/\1/p' gmx-plugin.toml | head -n 1)
if [ -n "${1:-}" ] && [ "$1" != "$version" ]; then
  echo "the tag says $1 but gmx-plugin.toml says $version; change one of them" >&2
  exit 1
fi
name=hls-player
rm -rf dist
mkdir -p "dist/stage/$name"
cp -R gmx-plugin.toml LICENSE README.md ui skills "dist/stage/$name/"
for platform in windows-x86_64 linux-x86_64 linux-aarch64 macos-aarch64 macos-x86_64; do
  case "$platform" in
    windows-*) (cd dist/stage && zip -qr "../$name-$version-$platform.zip" "$name") ;;
    *) tar -C dist/stage -czf "dist/$name-$version-$platform.tar.gz" "$name" ;;
  esac
done
rm -rf dist/stage
(cd dist && sha256sum * > SHA256SUMS)
ls -l dist
