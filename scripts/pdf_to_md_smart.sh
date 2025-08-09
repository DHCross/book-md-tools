#!/usr/bin/env bash
set -euo pipefail

# PDF → Markdown (smart pipeline)
# - OCR gate by bytes/page (auto|force|skip via OCRMODE env)
# - HTML extraction with mutool, fallback to pdftohtml
# - Deterministic media extraction via Pandoc
#
# Usage: pdf_to_md_smart.sh <input.pdf>

if [[ ${1:-} == "" ]]; then
  echo "Usage: $0 <input.pdf>" >&2
  exit 2
fi

SRC="$1"
ext="${SRC##*.}"
shopt -s nocasematch
if [[ ! $ext =~ ^pdf$ ]]; then
  echo "Only PDF input is supported currently: $SRC" >&2
  exit 2
fi
shopt -u nocasematch

# Resolve absolute paths
SRC="$(cd "$(dirname "$SRC")" && pwd)/$(basename "$SRC")"
BASE="$(basename "${SRC%.*}")"
OUT_DIR="$(dirname "$SRC")"
OUT_MD="$OUT_DIR/${BASE}.md"

# Env controls
OCRMODE="${OCRMODE:-${OCR:-auto}}"   # force|auto|skip (compat: OCR)
PANDOC_MEDIA="${PANDOC_MEDIA:-media/${BASE}}"

WORKDIR="${TMPDIR:-/tmp}/pdf2md_${BASE}_$$"
mkdir -p "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

# 1) Decide OCR use (bytes per page)
PDF="$SRC"
BYTES=$(pdftotext -enc UTF-8 "$PDF" - 2>/dev/null | wc -c | tr -d '[:space:]' || echo 0)
PAGES=$(pdfinfo "$PDF" 2>/dev/null | awk '/Pages:/ {print $2}' || echo 1)
if [[ -z "${PAGES}" || "${PAGES}" -eq 0 ]]; then PAGES=1; fi
BYTES_PER_PAGE=$(( ( ${BYTES:-0} + PAGES - 1 ) / PAGES ))

DO_OCR=0
case "$OCRMODE" in
  force) DO_OCR=1 ;;
  skip)  DO_OCR=0 ;;
  auto)  if [[ "${BYTES_PER_PAGE:-0}" -lt 100 ]]; then DO_OCR=1; fi ;;
  *) echo "Unknown OCRMODE: $OCRMODE (use force|auto|skip)" >&2; exit 2 ;;
esac

echo "Pages: $PAGES | Text bytes: ${BYTES:-0} | Bytes/page: ${BYTES_PER_PAGE} | OCR: $([[ $DO_OCR -eq 1 ]] && echo yes || echo no)"

SRC_PDF="$PDF"
if [[ $DO_OCR -eq 1 ]]; then
  echo "Running OCR (ocrmypdf --skip-text)..."
  OCR_OUT="$WORKDIR/ocr.pdf"
  ocrmypdf --skip-text --optimize 0 "$PDF" "$OCR_OUT"
  SRC_PDF="$OCR_OUT"
fi

# 2) Extract HTML (mutool → fallback to pdftohtml)
HTML_OUT="$WORKDIR/out.html"
# Try mutool first
if ! mutool convert -F html -o "$HTML_OUT" "$SRC_PDF" >/dev/null 2>&1; then
  :
fi
# If output missing or empty of <p>, fallback to Poppler
if [[ ! -s "$HTML_OUT" ]] || ! grep -q "<p" "$HTML_OUT" 2>/dev/null; then
  echo "Fallback to pdftohtml..."
  rm -f "$HTML_OUT"
  pdftohtml -s -i -q -noframes -enc UTF-8 "$SRC_PDF" "$WORKDIR/out" >/dev/null 2>&1 || true
  if [[ -f "$WORKDIR/out.html" ]]; then
    HTML_OUT="$WORKDIR/out.html"
  elif compgen -G "$WORKDIR/*.html" > /dev/null; then
    HTML_OUT="$(ls "$WORKDIR"/*.html | head -n1)"
  fi
fi

if [[ ! -f "$HTML_OUT" ]]; then
  echo "Failed to extract HTML from PDF." >&2
  exit 1
fi

# 3) Convert HTML → Markdown with deterministic media names
mkdir -p "$OUT_DIR"

echo "Converting HTML to Markdown with Pandoc..."
pandoc "$HTML_OUT" \
  --from=html-native_divs-native_spans \
  --to=markdown+pipe_tables+gfm_auto_identifiers \
  --wrap=none --reference-links --markdown-headings=setext \
  --extract-media="$PANDOC_MEDIA" \
  -o "$OUT_MD"

echo "✅ Wrote: $OUT_MD"
echo "📁 Media: $PANDOC_MEDIA"

# 4) Optional: run Markdown cleanup pipeline (enabled by default; set PIPELINE=0 to skip)
if [[ "${PIPELINE:-1}" -eq 1 ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  echo "Running Markdown cleanup pipeline..."
  TABLES_INLINE=${TABLES:-0} python3 "$SCRIPT_DIR/book_pipeline.py" "$OUT_MD" --out-suffix _progress_pipeline
fi
