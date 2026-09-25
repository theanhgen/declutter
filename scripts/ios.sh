#!/bin/bash
# Build the web extension + iOS container app and install it on a paired iPhone.
#   scripts/ios.sh                 -> first paired, available physical iPhone
#   IPHONE=<udid> scripts/ios.sh   -> that device
# Development signing (team 28DMV2MR8T): the install keeps working for the profile's lifetime (~1 year).
set -euo pipefail
# Xcode 27.2 beta for local builds (override: DEVELOPER_DIR=…).
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode-27.2-beta.app/Contents/Developer}"
cd "$(dirname "$0")/.."
DEVICE="${IPHONE:-$(xcrun devicectl list devices 2>/dev/null | awk '/available \(paired\)/ && /iPhone/ && /physical/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) print $i }' | head -1)}"
[ -n "$DEVICE" ] || { echo "no paired iPhone available (unlock it, same Wi-Fi or cable)"; exit 1; }
node build.mjs safari
(cd safari && xcodegen generate -q && rm -rf "Declutter 2.xcodeproj")
DD="$HOME/Library/Developer/Xcode/DerivedData/declutter-ios"
xcodebuild -project safari/Declutter.xcodeproj -scheme Declutter-iOS -configuration Debug \
  -destination "id=$DEVICE" -derivedDataPath "$DD" -allowProvisioningUpdates -quiet clean build
APP="$DD/Build/Products/Debug-iphoneos/Declutter.app"
codesign --verify --deep --strict "$APP"
xcrun devicectl device install app --device "$DEVICE" "$APP" >/dev/null
echo "Installed on $DEVICE. iPhone: Settings → Apps → Safari → Extensions → Declutter."
