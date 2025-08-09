#!/usr/bin/env python3
"""
Convert Markdown pipe tables into inline tab-delimited text within the same document.

- Replaces each Markdown pipe table with lines where columns are separated by a real TAB (\t)
  and rows by a real newline. This suits InDesign's Convert Text to Table (Tab / Paragraph).
- Skips code blocks and leaves non-table content unchanged.
- Intended for simple one-line cell tables produced by Pandoc.

Usage:
  python3 tools/md_tables_to_tsv_inline.py INPUT.md [-o OUTPUT.md] [--in-place]

Defaults:
  - If -o/--output is omitted and --in-place not given, writes alongside as <name>_inline.md
"""
import argparse
import io
import os
import re
from typing import List, Tuple

TABLE_SEP_RE = re.compile(r"^\s*\|?\s*(:?-{3,}:?)\s*(\|\s*(:?-{3,}:?)\s*)+\|?\s*$")
CODE_FENCE_RE = re.compile(r"^\s*`{3,}")


def looks_like_table_row(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    # Must have at least one vertical bar and not be a blockquote/list/code fence
    if s.startswith(('>', '#', '-', '*')):
        return False
    if '|' not in s:
        return False
    # A row typically starts/ends with '|' or has bars between cells
    return True


def split_pipe_row(line: str) -> List[str]:
    # Remove leading/trailing pipes and split on remaining unescaped pipes
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    # Split on '|' that are not escaped \
    parts = []
    cur = []
    escape = False
    for ch in s:
        if escape:
            cur.append(ch)
            escape = False
        elif ch == '\\':
            escape = True
        elif ch == '|':
            parts.append(''.join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append(''.join(cur))
    # Unescape escaped pipes and trim cells
    return [p.replace('\\|', '|').strip() for p in parts]


def convert_tables(text: str) -> Tuple[str, int]:
    lines = text.splitlines()
    out: List[str] = []
    i = 0
    in_code = False
    tables_converted = 0

    while i < len(lines):
        line = lines[i]
        # Handle fenced code blocks
        if CODE_FENCE_RE.match(line):
            in_code = not in_code
            out.append(line)
            i += 1
            continue
        if in_code:
            out.append(line)
            i += 1
            continue

        # Detect start of a pipe table (row, then separator row next)
        if looks_like_table_row(line) and i + 1 < len(lines) and TABLE_SEP_RE.match(lines[i + 1]):
            # Collect table block: header row, separator, then data rows until a non-table row/blank
            block: List[str] = [lines[i], lines[i + 1]]
            j = i + 2
            while j < len(lines) and looks_like_table_row(lines[j]):
                block.append(lines[j])
                j += 1
            # Convert header + data rows to TSV (skip separator row)
            tsv_lines: List[str] = []
            for k, row in enumerate(block):
                if k == 1 and TABLE_SEP_RE.match(row):
                    continue  # skip alignment row
                cells = split_pipe_row(row)
                tsv_lines.append('\t'.join(cells))
            # Emit TSV block (no code fences to keep raw tabs)
            out.extend(tsv_lines)
            tables_converted += 1
            i = j
            # Preserve a blank line after table for readability
            if i < len(lines) and lines[i].strip():
                out.append('')
            continue

        # Default: pass-through
        out.append(line)
        i += 1

    return '\n'.join(out) + ('\n' if text.endswith('\n') else ''), tables_converted


def main():
    ap = argparse.ArgumentParser(description='Replace Markdown pipe tables with inline tab-delimited text')
    ap.add_argument('input', help='Input Markdown file')
    ap.add_argument('-o', '--output', help='Output file (default: <name>_inline.md)')
    ap.add_argument('--in-place', action='store_true', help='Modify the input file in place')
    args = ap.parse_args()

    with io.open(args.input, 'r', encoding='utf-8') as f:
        text = f.read()

    converted, n = convert_tables(text)

    if args.in_place:
        out_path = args.input
    else:
        if args.output:
            out_path = args.output
        else:
            base, ext = os.path.splitext(args.input)
            out_path = f"{base}_inline{ext or '.md'}"

    with io.open(out_path, 'w', encoding='utf-8', newline='') as f:
        f.write(converted)

    print(f"Converted {n} table(s) -> tabs in: {out_path}")


if __name__ == '__main__':
    main()
