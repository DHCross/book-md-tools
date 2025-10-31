#!/usr/bin/env bash
# Helper script to launch the DocWorkbench GUI.
# Usage: ./launch_workbench.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "venv/bin/activate" ]]; then
  echo "⚠️  Virtual environment not found at venv/bin/activate." >&2
  echo "    Run 'python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt' first." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "venv/bin/activate"

exec python scripts/doc_workbench_app.py "$@"
