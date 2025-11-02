#!/usr/bin/env python3
"""
Markdown Table to Tab-Delimited Converter
==========================================

Converts markdown pipe tables to tab-delimited format for InDesign import.
Specifically designed for Nation Builder and similar TTRPG content.

Usage:
    python3 tools/md_table_to_tsv.py input.md -o output.txt
    python3 tools/md_table_to_tsv.py input.md --clipboard

Author: Book MD Tools
Date: 2025-11-02
"""

import argparse
import re
import sys
from pathlib import Path
from typing import List, Optional


def parse_markdown_table(table_text: str) -> List[List[str]]:
    """
    Parse a markdown pipe table into a list of rows.
    
    Args:
        table_text: Markdown table text with pipes
    
    Returns:
        List of rows, where each row is a list of cells
    """
    lines = [line.strip() for line in table_text.strip().split('\n') if line.strip()]
    rows = []
    
    for line in lines:
        # Skip separator lines (e.g., | :--- | :--- |)
        if re.match(r'^\|[\s:\-|]+\|$', line):
            continue
        
        # Remove leading/trailing pipes and split
        line = line.strip('|')
        cells = [cell.strip() for cell in line.split('|')]
        
        # Filter out empty cells at the end (but keep empty cells in the middle)
        # We'll preserve structure by keeping all cells
        rows.append(cells)
    
    return rows


def extract_tables_from_markdown(content: str) -> List[tuple]:
    """
    Extract all markdown tables from content.
    
    Returns:
        List of tuples: (preceding_header, table_rows)
    """
    lines = content.split('\n')
    tables = []
    current_table_lines = []
    current_header = ""
    in_table = False
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Check if this is a table line (starts with |)
        if stripped.startswith('|'):
            if not in_table:
                # New table starting - capture preceding header
                # Look backwards for the closest header
                for j in range(i - 1, max(-1, i - 10), -1):
                    prev_line = lines[j].strip()
                    # Check for markdown headers or bold text
                    if prev_line.startswith('#') or prev_line.startswith('**'):
                        current_header = prev_line.lstrip('#').strip('*').strip()
                        break
                in_table = True
            
            current_table_lines.append(line)
        elif in_table:
            # End of table
            if current_table_lines:
                table_rows = parse_markdown_table('\n'.join(current_table_lines))
                tables.append((current_header, table_rows))
                current_table_lines = []
                current_header = ""
            in_table = False
    
    # Handle table at end of file
    if current_table_lines:
        table_rows = parse_markdown_table('\n'.join(current_table_lines))
        tables.append((current_header, table_rows))
    
    return tables


def format_as_tsv(tables: List[tuple], include_headers: bool = True) -> str:
    """
    Format extracted tables as tab-separated values.
    
    Args:
        tables: List of (header, rows) tuples
        include_headers: Whether to include section headers
    
    Returns:
        Tab-delimited string
    """
    output_lines = []
    
    for header, rows in tables:
        if include_headers and header:
            output_lines.append(f"# {header}")
            output_lines.append("")  # Blank line after header
        
        for row in rows:
            # Join cells with real tab characters
            output_lines.append('\t'.join(row))
        
        # Blank line between tables
        output_lines.append("")
    
    return '\n'.join(output_lines)


def convert_file(input_path: Path, output_path: Optional[Path] = None, 
                 include_headers: bool = True, clipboard: bool = False) -> str:
    """
    Convert markdown file to tab-delimited format.
    
    Args:
        input_path: Path to input markdown file
        output_path: Path to output file (optional)
        include_headers: Include section headers
        clipboard: Copy to clipboard instead of saving
    
    Returns:
        The converted TSV content
    """
    # Read input
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract and convert tables
    tables = extract_tables_from_markdown(content)
    
    if not tables:
        print("Warning: No markdown tables found in input file", file=sys.stderr)
        return ""
    
    print(f"Found {len(tables)} table(s) in input file")
    
    # Format as TSV
    tsv_content = format_as_tsv(tables, include_headers)
    
    # Output
    if clipboard:
        try:
            import pyperclip
            pyperclip.copy(tsv_content)
            print("✓ Copied to clipboard!")
        except ImportError:
            print("Error: pyperclip not installed. Install with: pip install pyperclip", 
                  file=sys.stderr)
            print("\nContent:")
            print(tsv_content)
    elif output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(tsv_content)
        print(f"✓ Saved to: {output_path}")
    else:
        print(tsv_content)
    
    return tsv_content


def convert_text(markdown_text: str, include_headers: bool = True) -> str:
    """
    Convert markdown text to tab-delimited format.
    
    Args:
        markdown_text: Markdown content with pipe tables
        include_headers: Include section headers
    
    Returns:
        Tab-delimited string
    """
    tables = extract_tables_from_markdown(markdown_text)
    return format_as_tsv(tables, include_headers)


def main():
    parser = argparse.ArgumentParser(
        description='Convert markdown pipe tables to tab-delimited format for InDesign',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert file and save
  %(prog)s input.md -o output.txt
  
  # Convert and print to stdout
  %(prog)s input.md
  
  # Copy to clipboard (requires pyperclip)
  %(prog)s input.md --clipboard
  
  # Convert without section headers
  %(prog)s input.md --no-headers -o output.txt
        """
    )
    
    parser.add_argument('input', type=Path, help='Input markdown file')
    parser.add_argument('-o', '--output', type=Path, help='Output file path')
    parser.add_argument('--no-headers', action='store_true',
                       help='Exclude section headers from output')
    parser.add_argument('--clipboard', action='store_true',
                       help='Copy result to clipboard (requires pyperclip)')
    
    args = parser.parse_args()
    
    # Validate input
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        return 1
    
    # Convert
    try:
        convert_file(
            args.input, 
            args.output, 
            include_headers=not args.no_headers,
            clipboard=args.clipboard
        )
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
