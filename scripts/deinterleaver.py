#!/usr/bin/env python3
"""
Deinterleaver for two-column text files

This script operates on a core heuristic: it assumes that in a two-column text file,
there is a consistent vertical "river" of empty space separating the left and right columns.
It finds this river and uses it as the cutting point to reassemble the document.

This is specifically designed to fix documents converted from two-column PDFs where
the columns got interleaved during the conversion process.

Usage:
  python3 scripts/deinterleaver.py <input.txt> [--output <output.txt>]

The default output filename is the input filename with "_deinterleaved.txt" appended.
"""

import argparse
import re
import sys
from pathlib import Path
from collections import Counter
from typing import List, Tuple, Optional


def split_complex_line(line: str) -> List[str]:
    """
    Split a complex line that may contain [description] [price] [more_description][next_description].
    
    Returns a list of parts: [left_description, price, next_description] or just [line] if no pattern found.
    """
    # Look for embedded price patterns like "6 250gp weeks"
    price_pattern = re.search(r'\s(\d+gp)\s', line)
    if not price_pattern:
        # Check for simpler lowercase->uppercase merging
        merge_pattern = re.search(r'[a-z][A-Z]', line)
        if merge_pattern:
            split_point = merge_pattern.start() + 1
            left = line[:split_point].rstrip()
            right = line[split_point:].lstrip()
            return [left, right]
        return [line]
    
    # Found a price in the middle
    price_start = price_pattern.start(1)
    price_end = price_pattern.end(1)
    price = price_pattern.group(1)
    
    before_price = line[:price_start].rstrip()
    after_price = line[price_end:].lstrip()
    
    # Look for merge point in the after_price part
    merge_match = re.search(r'[a-z][A-Z]', after_price)
    if merge_match:
        merge_point = merge_match.start() + 1
        left_remainder = after_price[:merge_point].rstrip()
        next_description = after_price[merge_point:].lstrip()
        
        # Reconstruct the full left description
        full_left = before_price + ' ' + left_remainder if left_remainder else before_price
        
        return [full_left.strip(), price, next_description]
    else:
        # No merge found, just return the parts we have
        if after_price:
            full_left = before_price + ' ' + after_price
            return [full_left.strip()]
        return [before_price.strip()]


def analyze_line_for_split_points(line: str) -> List[int]:
    """
    Analyze a line to find potential split points where columns might be joined.
    
    Returns a list of character positions where a split might occur.
    """
    split_points = []
    
    # Look for patterns that suggest column merging:
    # 1. Lowercase letter immediately followed by uppercase (e.g., "workArmor")
    # 2. Currency patterns that suggest price column data mixed with description
    # 3. Specific patterns we've observed in the data
    
    # Pattern 1: lowercase followed by uppercase (most reliable indicator)
    for match in re.finditer(r'[a-z][A-Z]', line):
        split_points.append(match.start() + 1)
    
    # Pattern 2: digit+gp followed by space and then lowercase letter
    # This catches cases like "250gp weeks" where there's a space
    for match in re.finditer(r'\d+gp\s+[a-z]', line):
        # Split after "gp "
        gp_end = match.start() + match.group().find('gp') + 2
        split_points.append(gp_end)
    
    # Pattern 3: word ending in apostrophe+s followed immediately by letter
    # This catches cases like "weeks' workArmor"
    for match in re.finditer(r"[a-z]'\s*[A-Z]", line):
        split_points.append(match.end() - 1)
    
    return sorted(set(split_points))


def detect_column_split_pattern(lines: List[str]) -> Optional[int]:
    """
    Analyze the file to detect the most common column split pattern.
    
    Returns the character position where columns should be split, or None if not found.
    """
    split_position_votes = Counter()
    
    for line in lines:
        if len(line.strip()) < 10:  # Skip very short lines
            continue
            
        split_points = analyze_line_for_split_points(line.rstrip())
        for point in split_points:
            # Round to nearest 5 to account for minor variations
            rounded_point = round(point / 5) * 5
            split_position_votes[rounded_point] += 1
    
    if not split_position_votes:
        return None
    
    # Return the most common split position
    return split_position_votes.most_common(1)[0][0]


def split_line_at_position(line: str, position: int) -> Tuple[str, str]:
    """
    Split a line at the given position, handling the case where the position
    might be beyond the line length.
    """
    line = line.rstrip()
    if position >= len(line):
        return line, ""
    
    left = line[:position].rstrip()
    right = line[position:].lstrip()
    
    return left, right


def deinterleave_content(content: str) -> str:
    """
    Main deinterleaving function.
    
    Analyzes the content to find column split patterns and reassembles the text
    so that all left column content comes first, followed by all right column content.
    """
    lines = content.split('\n')
    
    left_column_lines = []
    right_column_lines = []
    
    for line in lines:
        line = line.rstrip()
        
        # Skip empty lines - preserve them in left column
        if not line:
            left_column_lines.append("")
            continue
        
        # Try to split complex lines
        parts = split_complex_line(line)
        
        if len(parts) == 1:
            # Normal line, add to left column
            left_column_lines.append(parts[0])
        elif len(parts) == 2:
            # Simple split: left and right
            left_column_lines.append(parts[0])
            if parts[1]:  # Only add non-empty right column content
                right_column_lines.append(parts[1])
        elif len(parts) == 3:
            # Complex split: left_description, price, next_description
            left_column_lines.append(parts[0])
            if parts[1]:  # Add price to right column
                right_column_lines.append(parts[1])
            if parts[2]:  # Add next description to left column
                left_column_lines.append(parts[2])
    
    # Reassemble: all left column content first, then right column content
    result_lines = []
    
    # Add left column content
    for line in left_column_lines:
        result_lines.append(line)
    
    # Add a separator if we have right column content
    if right_column_lines and any(line.strip() for line in right_column_lines):
        result_lines.append("")
        result_lines.append("# Right Column Content")
        result_lines.append("")
        
        # Add right column content
        for line in right_column_lines:
            result_lines.append(line)
    
    return '\n'.join(result_lines)


def process_file(input_path: Path, output_path: Path) -> None:
    """Process a single file through the deinterleaver."""
    print(f"Reading input file: {input_path}")
    
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print("Analyzing content for column patterns...")
    deinterleaved_content = deinterleave_content(content)
    
    print(f"Writing deinterleaved content to: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(deinterleaved_content)
    
    print("Deinterleaving complete!")


def main():
    parser = argparse.ArgumentParser(
        description='Deinterleave two-column text files by detecting and splitting merged columns',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('input', type=Path, help='Input text file to deinterleave')
    parser.add_argument('--output', '-o', type=Path, 
                       help='Output file path (default: input_deinterleaved.txt)')
    
    args = parser.parse_args()
    
    input_path = args.input.resolve()
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1
    
    if args.output:
        output_path = args.output.resolve()
    else:
        # Default output: add "_deinterleaved" before the extension
        stem = input_path.stem
        suffix = input_path.suffix if input_path.suffix else '.txt'
        output_path = input_path.parent / f"{stem}_deinterleaved{suffix}"
    
    try:
        process_file(input_path, output_path)
        return 0
    except Exception as e:
        print(f"Error processing file: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())