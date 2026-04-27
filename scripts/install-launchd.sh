#!/usr/bin/env bash
# Install/uninstall the launchd agent for daily auto-sync.
# Usage:
#   bash scripts/install-launchd.sh install
#   bash scripts/install-launchd.sh uninstall
#   bash scripts/install-launchd.sh test     # run update.sh once to verify

set -euo pipefail

LABEL="com.pokare.gpt-image-2-jp"
SRC_PLIST="$(cd "$(dirname "$0")" && pwd)/${LABEL}.plist"
DEST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UPDATE_SH="$(cd "$(dirname "$0")" && pwd)/update.sh"

cmd="${1:-install}"

case "$cmd" in
  install)
    chmod +x "$UPDATE_SH"
    mkdir -p "$HOME/Library/LaunchAgents"
    cp "$SRC_PLIST" "$DEST_PLIST"
    # Use bootstrap (modern) with fallback to load (older macOS)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$DEST_PLIST" 2>/dev/null || launchctl load "$DEST_PLIST"
    echo "✓ Installed launchd agent: $LABEL"
    echo "  Schedule: daily at 09:00"
    echo "  Logs:     ~/Library/Logs/gpt-image-2-jp*.log"
    echo "  Plist:    $DEST_PLIST"
    echo ""
    echo "To trigger a one-shot test now: bash $0 test"
    ;;

  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || launchctl unload "$DEST_PLIST" 2>/dev/null || true
    rm -f "$DEST_PLIST"
    echo "✓ Uninstalled launchd agent: $LABEL"
    ;;

  test)
    echo "Running update.sh once..."
    bash "$UPDATE_SH"
    echo ""
    echo "Check log: ~/Library/Logs/gpt-image-2-jp.log"
    ;;

  status)
    if launchctl list | grep -q "$LABEL"; then
      echo "✓ Agent loaded"
      launchctl list | grep "$LABEL"
    else
      echo "✗ Agent not loaded"
    fi
    if [ -f "$DEST_PLIST" ]; then
      echo "✓ Plist installed at $DEST_PLIST"
    else
      echo "✗ Plist not installed"
    fi
    ;;

  *)
    echo "Usage: $0 {install|uninstall|test|status}"
    exit 1
    ;;
esac
