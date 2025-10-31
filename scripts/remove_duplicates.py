#!/usr/bin/env python3
"""
Remove duplicate content from a Markdown file.

This script identifies and removes duplicated sections in a Markdown file
while preserving the document structure and formatting.
"""
import re
import argparse
from pathlib import Path
from typing import List, Dict, Set, Tuple
from dataclasses import dataclass

@dataclass
class Section:
    """Represents a section of the document with its content and boundaries."""
    start: int
    end: int
    content: str
    header: str = ""
    is_duplicate: bool = False

def find_sections(lines: List[str]) -> List[Section]:
    """Identify sections in the Markdown document based on headers."""
    sections = []
    current_section = []
    in_code_block = False
    current_header = "Document Start"
    
    for i, line in enumerate(lines):
        # Toggle code block state
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
        
        # Skip processing inside code blocks
        if in_code_block:
            current_section.append(line)
            continue
        
        # Check for headers (##, ###, etc.)
        header_match = re.match(r'^(#{1,6})\s+(.*?)(?:\s*#*)?$', line)
        if header_match:
            if current_section:
                # Save the current section
                sections.append(Section(
                    start=start_line,
                    end=i-1,
                    content=''.join(current_section),
                    header=current_header
                ))
                current_section = []
            
            current_header = header_match.group(2).strip()
            start_line = i
        
        current_section.append(line)
    
    # Add the last section
    if current_section:
        sections.append(Section(
            start=start_line if 'start_line' in locals() else 0,
            end=len(lines) - 1,
            content=''.join(current_section),
            header=current_header
        ))
    
    return sections

def find_duplicate_sections(sections: List[Section]) -> List[Section]:
    """Identify and mark duplicate sections."""
    content_map = {}
    
    for i, section in enumerate(sections):
        # Skip very short sections as they're likely not meaningful duplicates
        if len(section.content.strip()) < 100:
            continue
            
        # Normalize whitespace for comparison
        normalized = re.sub(r'\s+', ' ', section.content).strip()
        
        if normalized in content_map:
            # Mark both the original and duplicate
            sections[content_map[normalized]].is_duplicate = True
            section.is_duplicate = True
        else:
            content_map[normalized] = i
    
    return sections

def remove_duplicates(input_file: Path, output_file: Path, dry_run: bool = False) -> None:
    """Remove duplicate sections from the input file and write to output file."""
    print(f"Processing {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    sections = find_sections(lines)
    sections = find_duplicate_sections(sections)
    
    # Identify duplicate sections
    duplicate_sections = [s for s in sections if s.is_duplicate]
    
    if not duplicate_sections:
        print("No duplicate sections found.")
        return
    
    print(f"Found {len(duplicate_sections)} duplicate sections:")
    for i, section in enumerate(duplicate_sections, 1):
        print(f"  {i}. {section.header} (lines {section.start+1}-{section.end+1})")
    
    if dry_run:
        print("\nDry run complete. No changes were made.")
        return
    
    # Create a set of line numbers to exclude
    lines_to_remove = set()
    for section in duplicate_sections:
        lines_to_remove.update(range(section.start, section.end + 1))
    
    # Write non-duplicate lines to output file
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, line in enumerate(lines):
            if i not in lines_to_remove:
                f.write(line)
    
    print(f"\nCleaned content written to {output_file}")

def main():
    parser = argparse.ArgumentParser(description='Remove duplicate sections from a Markdown file.')
    parser.add_argument('input_file', type=str, help='Input Markdown file')
    parser.add_argument('-o', '--output', type=str, help='Output file (default: input_cleaned.md)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be removed without making changes')
    
    args = parser.parse_args()
    
    input_file = Path(args.input_file)
    if not input_file.exists():
        print(f"Error: Input file '{input_file}' not found.", file=sys.stderr)
        sys.exit(1)
    
    output_file = Path(args.output) if args.output else input_file.parent / f"{input_file.stem}_deduped{input_file.suffix}"
    
    remove_duplicates(input_file, output_file, args.dry_run)

if __name__ == "__main__":
    import sys
    main()
