#!/usr/bin/env bash
set -euo pipefail

KIT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BG_ROOT="${SYDNEY_BG_ROOT:-$(dirname -- "$KIT_ROOT")/pi-background-tasks}"
SUB_ROOT="${SUBAGENTS_ROOT:-$(dirname -- "$KIT_ROOT")/pi-subagents}"
TEST_ROOT="$KIT_ROOT/dist/raspi-pi-test"

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: bash scripts/start-raspi-test.sh [Pi options]' 'Example: bash scripts/start-raspi-test.sh --model provider/model' 'Resume: bash scripts/start-raspi-test.sh --continue' 'Loads only the three development plugins; uses existing model credentials.'
  exit 0
fi
for root in "$KIT_ROOT" "$BG_ROOT" "$SUB_ROOT"; do
  [[ -f "$root/package.json" ]] || { printf 'Missing project: %s\n' "$root" >&2; exit 1; }
done
command -v pi >/dev/null || { printf 'pi is not on PATH\n' >&2; exit 1; }
mkdir -p "$TEST_ROOT"
cd -- "$TEST_ROOT"
printf '%s\n' 'Starting interactive Pi with development plugins.' 'Use /remote ssh raspi to connect. SSH reachability and host-key confirmation may be required.' 'Test instructions are in the supplied prompt. No global plugin settings are changed.'
exec pi --offline --no-extensions --no-mcp --no-skills --no-prompt-templates --no-context-files \
  -e "$KIT_ROOT" -e "$BG_ROOT" -e "$SUB_ROOT" \
  --append-system-prompt "$KIT_ROOT/scripts/raspi-test-prompt.md" "$@"
