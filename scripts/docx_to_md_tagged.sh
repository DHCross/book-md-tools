#!/usr/bin/env bash
set -euo pipefail

# DOCX → Markdown respecting custom Word tags (<ch>, <1>, <2>, <3>)
# - Uses a Pandoc Python filter to map tags to Markdown headings
# - Extracts media deterministically to media/<docname>
# - Optionally runs the Markdown cleanup pipeline (PIPELINE=1 by default)
#
# Usage: docx_to_md_tagged.sh <input.docx>

if [[ ${1:-} == "" ]]; then
  echo "Usage: $0 <input.docx>" >&2
  exit 2
fi

SRC="$1"
ext="${SRC##*.}"
shopt -s nocasematch
if [[ ! $ext =~ ^docx$ ]]; then
  echo "Only DOCX input is supported currently: $SRC" >&2
  exit 2
fi
shopt -u nocasematch

SRC="$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")"
BASE="$(basename "${SRC%.*}")"
OUT_DIR="$(dirname "$SRC")"
OUT_MD="$OUT_DIR/${BASE}.md"

PANDOC_MEDIA="${PANDOC_MEDIA:-media/${BASE}}"
FILTER_PATH="$(cd "$(dirname "$0")"/.. && pwd)/filters/word_tag_to_markdown_filter.py"

if [[ ! -f "$FILTER_PATH" ]]; then
  echo "Missing filter: $FILTER_PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Converting DOCX to Markdown (preserving custom tags)..."
pandoc "$SRC" \
  --wrap=none --markdown-headings=setext \
  --to=markdown+pipe_tables+gfm_auto_identifiers \
  --extract-media="$PANDOC_MEDIA" \
  --filter "python3 $FILTER_PATH" \
  -o "$OUT_MD"

echo "✅ Wrote: $OUT_MD"
echo "📁 Media: $PANDOC_MEDIA"

# Optional: run Markdown cleanup pipeline (enabled by default; set PIPELINE=0 to skip)
if [[ "${PIPELINE:-1}" -eq 1 ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  echo "Running Markdown cleanup pipeline..."
  python3 "$SCRIPT_DIR/book_pipeline.py" "$OUT_MD" --out-suffix _progress_pipeline
fi
