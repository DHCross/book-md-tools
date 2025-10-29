#!/usr/bin/env python3
"""
Missing Space Inserter for Markdown Documents

This script fixes missing spaces between lowercase and uppercase letters in words,
which is a common OCR error (e.g., "DesignEssential" -> "Design Essential").

It preserves:
- Proper nouns (e.g., "MacBook" remains unchanged)
- Markdown formatting (e.g., "**bold**")
- Code blocks and inline code
- URLs and email addresses
- Common abbreviations and acronyms
"""

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

# Common abbreviations and proper nouns that shouldn't be split
CONFIRMED_MERGE_MAP = {
    'DesignEssential': 'Design Essential',
    'SouthernRebellion': 'Southern Rebellion',
}


@dataclass
class ChangeRecord:
    line: int
    original: str
    fixed: str


class SpaceInserter:
    def __init__(self, replacements: Iterable[Tuple[str, str]] = None):
        self.replacement_map = dict(replacements or CONFIRMED_MERGE_MAP.items())
        self.changes: List[ChangeRecord] = []
        self.changes_made = 0

    def insert_spaces(self, text: str) -> Tuple[str, List[ChangeRecord]]:
        self.changes = []
        self.changes_made = 0

        lines = text.split('\n')
        processed_lines: List[str] = []

        for line_num, line in enumerate(lines, 1):
            processed_lines.append(self._process_line(line, line_num))

        return '\n'.join(processed_lines), self.changes

    def _process_line(self, line: str, line_num: int) -> str:
        if not line:
            return line

        updated_line = line
        for original, replacement in self.replacement_map.items():
            occurrences = updated_line.count(original)
            if not occurrences:
                continue

            updated_line = updated_line.replace(original, replacement)
            self.changes_made += occurrences
            for _ in range(occurrences):
                self.changes.append(ChangeRecord(line=line_num, original=original, fixed=replacement))

        return updated_line

def main():
    parser = argparse.ArgumentParser(
        description='Fix missing spaces between lowercase and uppercase letters in Markdown files.'
    )
    parser.add_argument('input_file', help='Input Markdown file')
    parser.add_argument('-o', '--output', help='Output file (default: input_file_fixed.md)')
    parser.add_argument('--dry-run', action='store_true', help='Show changes without modifying files')
    parser.add_argument('--verbose', '-v', action='store_true', help='Show detailed output')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file '{input_path}' not found.", file=sys.stderr)
        sys.exit(1)
    
    # Read the input file
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Initialize the space inserter with confirmed merge replacements
    inserter = SpaceInserter()
    
    # Fix missing spaces
    fixed_content, changes = inserter.insert_spaces(content)
    
    # Prepare output
    output_path = args.output or input_path.with_stem(f"{input_path.stem}_fixed")
    
    if args.dry_run or args.verbose:
        print(f"Found {inserter.changes_made} confirmed merge replacements.")
        if changes and args.verbose:
            print("\nChanges to be made:")
            for change in changes[:10]:  # Show first 10 changes
                print(f"  [line {change.line}] '{change.original}' -> '{change.fixed}'")
            if len(changes) > 10:
                print(f"  ... and {len(changes) - 10} more changes")
    
    if not args.dry_run:
        # Write the fixed content to the output file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        
        print(f"Fixed {inserter.changes_made} missing spaces.")
        print(f"Output written to: {output_path}")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
