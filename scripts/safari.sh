#!/bin/bash
# Build the web extension, the signed Safari container app, and install it to ~/Applications.
# DerivedData stays outside ~/Desktop: iCloud's xattrs there make codesign fail.
set -euo pipefail
cd "$(dirname "$0")/.."
node build.mjs safari
(cd safari && xcodegen generate -q)
DD="$HOME/Library/Developer/Xcode/DerivedData/declutter"
xcodebuild -project safari/Declutter.xcodeproj -scheme Declutter -configuration Debug \
  -derivedDataPath "$DD" -allowProvisioningUpdates -quiet build
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Declutter.app"
ditto "$DD/Build/Products/Debug/Declutter.app" "$HOME/Applications/Declutter.app"
# Leave only the installed copy: Safari lists every registered copy of the app as its own extension.
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -u "$DD/Build/Products/Debug/Declutter.app" 2>/dev/null || true
rm -rf "$DD/Build/Products/Debug/Declutter.app"
codesign --verify --deep --strict "$HOME/Applications/Declutter.app"
open -g "$HOME/Applications/Declutter.app"
echo "Installed ~/Applications/Declutter.app. Safari picks up the new build after it reloads the extension (toggle it off/on, or relaunch Safari)."
