#!/bin/bash
# App Store builds of the Safari apps (macOS + iOS/iPadOS): store web extension (walls default manual, no tip
# link), Release archive, export signed for App Store Connect into dist/appstore/<platform>/.
# Nothing is uploaded. Upload: open the .xcarchive in Xcode Organizer → Distribute, or
#   xcrun altool --upload-package … / Transporter with the exported .pkg/.ipa.
#   scripts/archive.sh            -> both platforms
#   scripts/archive.sh ios|macos  -> one
set -euo pipefail
# App Store Connect rejects builds from a beta Xcode (non-RC), so store builds use the release Xcode.
# XCODE=beta forces the beta (local testing only; not submittable).
if [ "${XCODE:-}" = beta ]; then export DEVELOPER_DIR=/Applications/Xcode-27.2-beta.app/Contents/Developer
else export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"; fi
cd "$(dirname "$0")/.."
node build.mjs --store safari
(cd safari && xcodegen generate -q && rm -rf "Declutter 2.xcodeproj")
OUT="$HOME/Library/Developer/Xcode/Archives/declutter"   # off ~/Desktop: iCloud xattrs break codesign
DIST="$PWD/dist/appstore"
OPTS=$(mktemp -t exportopts).plist
cat > "$OPTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>28DMV2MR8T</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST
for p in ${1:-macos ios}; do
  case "$p" in
    macos) scheme=Declutter; dest="generic/platform=macOS" ;;
    ios) scheme=Declutter-iOS; dest="generic/platform=iOS" ;;
    *) echo "unknown platform $p"; exit 1 ;;
  esac
  archive="$OUT/$p.xcarchive"
  rm -rf "$archive" "$DIST/$p"
  xcodebuild -project safari/Declutter.xcodeproj -scheme "$scheme" -configuration Release -destination "$dest" \
    -archivePath "$archive" -allowProvisioningUpdates -quiet clean archive
  xcodebuild -exportArchive -archivePath "$archive" -exportPath "$DIST/$p" -exportOptionsPlist "$OPTS" \
    -allowProvisioningUpdates -quiet
  echo "$p: archive $archive, export $(ls "$DIST/$p" | grep -E '\.(pkg|ipa)$')"
done
