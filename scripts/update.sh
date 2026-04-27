#!/usr/bin/env bash
# Daily auto-sync: fetch all upstream READMEs → re-parse → push if changed
# Designed to run from launchd. Sends macOS notifications on success/error.

set -euo pipefail

REPO_DIR="$HOME/gpt-image-2-jp"
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/gpt-image-2-jp.log"

mkdir -p "$LOG_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

notify() {
  local title="$1"
  local message="$2"
  local sound="${3:-Glass}"
  /usr/bin/osascript -e "display notification \"${message//\"/\\\"}\" with title \"${title//\"/\\\"}\" sound name \"$sound\"" || true
}

on_error() {
  local exit_code=$?
  local line=$1
  log "ERROR: exited with $exit_code at line $line"
  notify "⚠️ GPT Image 2 プロンプト集の更新に失敗" "ログ: $LOG_FILE (line $line, exit $exit_code)" "Basso"
  exit $exit_code
}
trap 'on_error $LINENO' ERR

cd "$REPO_DIR"

log "=== Auto-sync started ==="

git pull --rebase --quiet origin main 2>>"$LOG_FILE"

OLD_COUNT=$(node -e "try{console.log(require('./src/data/prompts.json').length)}catch(e){console.log(0)}")
OLD_HASH=$(shasum -a 256 src/data/prompts.json 2>/dev/null | awk '{print $1}' || echo "none")

# Fetch all sources and re-parse
npm run --silent fetch-sources >>"$LOG_FILE" 2>&1
npm run --silent parse >>"$LOG_FILE" 2>&1

NEW_COUNT=$(node -e "console.log(require('./src/data/prompts.json').length)")
NEW_HASH=$(shasum -a 256 src/data/prompts.json | awk '{print $1}')
PENDING_COUNT=$(node -e "console.log(require('./src/data/pending-translations.json').length)")

# Detect new entries that need translation (pending > 0 means cache miss)
if [ "$PENDING_COUNT" -gt 0 ]; then
  log "WARNING: $PENDING_COUNT new English entries need translation"
  notify "📝 翻訳が必要" "新規 ${PENDING_COUNT} 件の英語プロンプトを日本語化してください。Claude Code で 'cd ~/gpt-image-2-jp && 翻訳バッチ' と頼むか、手動で対応。" "Funk"
  # Continue: we still commit the new entries even if untranslated, so the site reflects upstream changes
fi

if [ "$OLD_HASH" = "$NEW_HASH" ]; then
  log "No upstream changes (count=$NEW_COUNT). Skipping commit."
  exit 0
fi

DELTA=$((NEW_COUNT - OLD_COUNT))
log "Changes detected: $OLD_COUNT → $NEW_COUNT (delta=$DELTA, pending=$PENDING_COUNT)"

# Stage all data files (cache may have been updated externally)
git add src/data/prompts.json src/data/meta.json src/data/pending-translations.json src/data/translations-cache.json 2>/dev/null || true
git -c user.email=takesuzue8282@gmail.com -c user.name=Pokare \
    commit -q -m "Auto-sync: $NEW_COUNT prompts (Δ$DELTA, pending $PENDING_COUNT)"
git push --quiet origin main 2>>"$LOG_FILE"

if [ "$DELTA" -gt 0 ]; then
  MSG="新規 +${DELTA} 件 / 合計 ${NEW_COUNT} 件"
elif [ "$DELTA" -lt 0 ]; then
  MSG="削除 ${DELTA} 件 / 合計 ${NEW_COUNT} 件"
else
  MSG="プロンプト内容が更新 / 合計 ${NEW_COUNT} 件"
fi

notify "✅ GPT Image 2 プロンプト集を更新" "$MSG"
log "Pushed. Site rebuild will run in GitHub Actions."
log "=== Done ==="
