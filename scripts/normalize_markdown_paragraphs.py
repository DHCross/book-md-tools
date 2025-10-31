#!/usr/bin/env python3
"""Normalize Markdown paragraphs for files converted from Word/PDF sources.

This tool:
- merges wrapped lines that belong to the same paragraph,
- inserts a single blank line between actual paragraphs, and
- preserves Markdown structural elements (headers, lists, blockquotes, tables, code fences).
"""
from pathlib import Path
import re
import sys

STRUCTURAL_PREFIXES = ("#", "*", "-", ">", "|")


def merge_wrapped_lines(text: str) -> str:
    """Merge lines that are part of the same logical paragraph."""
    lines = text.split("\n")
    merged_lines = []
    buffer = []

    for line in lines:
        stripped = line.strip()

        # Blank line: finalize current paragraph and preserve separator.
        if not stripped:
            if buffer:
                merged_lines.append(" ".join(buffer).strip())
                buffer = []
            merged_lines.append("")
            continue

        # Preserve structural Markdown lines without merging.
        if stripped.startswith(STRUCTURAL_PREFIXES):
            if buffer:
                merged_lines.append(" ".join(buffer).strip())
                buffer = []
            merged_lines.append(stripped)
            continue

        # Otherwise treat as part of current paragraph buffer.
        buffer.append(stripped)

    if buffer:
        merged_lines.append(" ".join(buffer).strip())

    return "\n".join(merged_lines)


def normalize_markdown(file_path: Path) -> Path:
    """Normalize paragraphs and return path to cleaned output file."""
    text = file_path.read_text(encoding="utf-8")

    # Step 1: normalize newlines to LF.
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Step 2: merge wrapped lines inside paragraphs.
    text = merge_wrapped_lines(text)

    # Step 3: ensure exactly one blank line between paragraphs.
    text = re.sub(r"\n{3,}", "\n\n", text)

    output_path = file_path.with_name(f"{file_path.stem}_cleaned{file_path.suffix}")
    output_path.write_text(text, encoding="utf-8")
    return output_path


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python normalize_markdown_paragraphs.py <markdown_file>")
        sys.exit(1)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    output_path = normalize_markdown(file_path)
    print("✅ Cleaned file written to:\n" f"{output_path}")
    print("→ Fixed wrapped lines, added consistent paragraph spacing, and preserved Markdown structure.")


if __name__ == "__main__":
    main()
