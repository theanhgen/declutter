#!/bin/bash
# Install or remove the daily canary LaunchAgent (07:30; runs at next wake if the Mac was asleep).
set -euo pipefail
LABEL=com.theanhgen.declutter-canary
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
case "${1:-}" in
  install)
    sed "s|__REPO__|$(cd "$(dirname "$0")/.." && pwd)|" "$(dirname "$0")/../canary/$LABEL.plist" > "$DEST"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$DEST"
    echo "installed; log: /tmp/declutter-canary.log; run now: launchctl kickstart gui/$(id -u)/$LABEL" ;;
  remove)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$DEST"; echo removed ;;
  *) echo "usage: $0 install|remove"; exit 1 ;;
esac
