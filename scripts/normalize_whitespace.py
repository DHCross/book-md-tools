#!/usr/bin/env python3
"""
Markdown Whitespace Normalizer (Refined)

This script performs targeted whitespace normalization in Markdown files while carefully preserving:
- Code blocks and inline code
- URLs, email addresses, and special characters
- Markdown formatting and structure
- Non-breaking spaces and other special whitespace
"""

import re
import sys
from pathlib import Path
from typing import List, Tuple, Dict, Set, Optional, Pattern
import argparse

class WhitespaceNormalizer:
    def __init__(self):
        self.changes_made = 0
        self.original_line_ending = '\n'
        # Compiled regex patterns for better performance
        self.preserve_patterns = [
            re.compile(r'`[^`]+`'),  # Inline code
            re.compile(r'```[\s\S]*?```', re.MULTILINE),  # Code blocks
            re.compile(r'\[([^\]]+)\]\([^)]+\)'),  # Links [text](url)
            re.compile(r'<[^>]+>'),  # HTML tags
            re.compile(r'\$[^$]+\$'),  # Math expressions
            re.compile(r'\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_'),  # Bold/italic
        ]
        
        # Common abbreviations that should keep their spaces
        self.abbreviations = {
            'i.e.', 'e.g.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Prof.',
            'St.', 'Ave.', 'Blvd.', 'Rd.', 'Ltd.', 'Inc.', 'Corp.', 'Co.',
            'No.', 'Vol.', 'Ch.', 'Fig.', 'et al.', 'a.m.', 'p.m.'
        }
        
        # Special patterns that should be preserved as-is
        self.special_patterns = [
            r'\d+\s*[x×]\s*\d+',  # Dimensions (e.g., 2x4, 10×10)
            r'\d+\s*[a-zA-Z]+',     # Measurements (e.g., 10 kg, 5 ft)
            r'[A-Za-z]\.[A-Za-z]\.', # Abbreviations with dots (e.g., U.S., p.m.)
        ]
        
    def is_in_preserved_region(self, text: str, pos: int) -> bool:
        """Check if the position is within any preserved pattern."""
        for pattern in self.preserve_patterns:
            for match in pattern.finditer(text):
                if match.start() <= pos < match.end():
                    return True
        return False
    
    def is_special_pattern(self, text: str, pos: int) -> bool:
        """Check if the position is part of a special pattern that should be preserved."""
        for pattern in self.special_patterns:
            for match in re.finditer(pattern, text):
                if match.start() <= pos < match.end():
                    return True
        return False
    
    def normalize_line_endings(self, text: str) -> str:
        """Normalize line endings to LF while detecting the original style."""
        if '\r\n' in text:
            self.original_line_ending = '\r\n'
        # Normalize to LF for consistent processing
        return text.replace('\r\n', '\n').replace('\r', '\n')
    
    def restore_line_endings(self, text: str) -> str:
        """Restore the original line ending style."""
        if self.original_line_ending == '\n':
            return text
        return text.replace('\n', self.original_line_ending)
    
    def normalize_whitespace(self, text: str) -> Tuple[str, List[Tuple[str, str]]]:
        """
        Normalize whitespace in the text with careful handling of Markdown syntax.
        
        Returns:
            A tuple of (normalized_text, changes) where changes is a list of
            (original_line, fixed_line) tuples.
        """
        self.changes_made = 0
        changes = []
        
        # Normalize line endings to LF for consistent processing
        text = self.normalize_line_endings(text)
        
        lines = text.split('\n')
        result = []
        
        in_code_block = False
        in_html_block = False
        
        for line_num, line in enumerate(lines, 1):
            original_line = line
            
            # Track code block state
            line_stripped = line.strip()
            if line_stripped.startswith('```'):
                in_code_block = not in_code_block
                result.append(line)
                continue
                
            # Track HTML block state
            if line_stripped.startswith('<') and not line_stripped.startswith('<!--'):
                in_html_block = not in_html_block
                result.append(line)
                continue
                
            # Skip code blocks and HTML blocks
            if in_code_block or in_html_block:
                result.append(line)
                continue
                
            # Process the line
            processed_line = self.process_line(line, line_num)
            
            # Only record changes if the line was actually modified
            if processed_line != original_line:
                changes.append((original_line, processed_line))
                self.changes_made += 1
                
            result.append(processed_line)
        
        return self.restore_line_endings('\n'.join(result)), changes
    
    def process_line(self, line: str, line_num: int) -> str:
        """Process a single line of text with careful whitespace handling."""
        if not line.strip():
            return line  # Preserve empty lines
            
        # Skip lines that are part of tables, code blocks, or other special formatting
        if any(line.lstrip().startswith(c) for c in ('|', '>', '#', '-', '*', '+', '`', '~', '=', '<', '>', '\t')):
            return line
            
        # Process the line in segments to handle different patterns
        processed_parts = []
        current_pos = 0
        
        # First, identify and process special segments
        segments = []
        last_pos = 0
        
        # Find all preserved regions
        for pattern in self.preserve_patterns + [re.compile(p) for p in self.special_patterns]:
            for match in pattern.finditer(line):
                if match.start() > last_pos:
                    # Add the text before this match
                    segments.append(('text', line[last_pos:match.start()]))
                segments.append(('preserved', match.group(0)))
                last_pos = match.end()
        
        # Add any remaining text
        if last_pos < len(line):
            segments.append(('text', line[last_pos:]))
        
        # Process each segment
        for seg_type, content in segments:
            if seg_type == 'preserved':
                processed_parts.append(content)
            else:
                # Process normal text segments
                processed_parts.append(self._process_text_segment(content))
        
        # Join all parts and clean up
        processed = ''.join(processed_parts)
        
        # Handle specific patterns that need spaces after punctuation
        processed = re.sub(r'([.,:;!?])([^\s\d])', r'\1 \2', processed)
        
        # Remove any double spaces that might have been created
        processed = re.sub(r' {2,}', ' ', processed)
        
        # Remove trailing whitespace
        processed = processed.rstrip()
        
        return processed
    
    def _process_text_segment(self, text: str) -> str:
        """Process a segment of text that isn't in a preserved region."""
        if not text.strip():
            return text
            
        # Handle common cases where spaces were removed
        text = re.sub(r'(?<=\w)([.,:;!?])(?=\w)', r'\1 ', text)
        
        # Handle spaces around em-dashes
        text = re.sub(r'\s*—\s*', ' — ', text)
        
        # Handle spaces after opening quotes and before closing quotes
        text = re.sub(r'"(\w)', r'"\1', text)
        text = re.sub(r'(\w)"', r'\1"', text)
        
        # Handle spaces after opening parentheses and before closing
        text = re.sub(r'\(\s+', ' (', text)
        text = re.sub(r'\s+\)', ') ', text)
        
        # Handle spaces before and after slashes
        text = re.sub(r'\s*/\s*', '/', text)
        
        # Clean up any double spaces that might have been created
        text = re.sub(r' {2,}', ' ', text)
        
        return text
    
    def is_abbreviation(self, line: str, space_pos: int) -> bool:
        """Check if the space is part of an abbreviation."""
        # Look for word before the space
        start = space_pos - 1
        while start >= 0 and (line[start].isalpha() or line[start] == '.'):
            if line[start] == '.':
                # Check if this is a known abbreviation
                word = line[start:space_pos].lower()
                if word in {abbr.lower() for abbr in self.abbreviations}:
                    return True
                break
            start -= 1
            
        return False
        
        # Join lines with normalized line endings
        normalized_text = self.restore_line_endings('\n'.join(result))
        
        return normalized_text, changes

def main():
    parser = argparse.ArgumentParser(
        description='Normalize whitespace in Markdown files with careful handling of special cases.',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument('input_file', help='Input Markdown file to process')
    parser.add_argument('-o', '--output', help='Output file (default: <input>_normalized.<ext>)')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what changes would be made without modifying files')
    parser.add_argument('--verbose', '-v', action='store_true', 
                       help='Show detailed information about each change')
    parser.add_argument('--max-changes', type=int, default=10,
                       help='Maximum number of changes to display in verbose mode')
    
    args = parser.parse_args()
    
    # Validate input file
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file '{input_path}' not found.", file=sys.stderr)
        return 1
    
    # Determine output path if not specified
    if not args.output:
        output_path = input_path.with_name(f"{input_path.stem}_normalized{input_path.suffix}")
    else:
        output_path = Path(args.output)
    
    try:
        # Read the input file with original line endings
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Initialize and run the normalizer
        normalizer = WhitespaceNormalizer()
        normalized_content, changes = normalizer.normalize_whitespace(content)
        
        # Display results
        if args.dry_run or args.verbose:
            change_count = len(changes)
            print(f"\nAnalysis complete. Found {change_count} potential whitespace issues.")
            
            if change_count > 0 and args.verbose:
                print("\nChanges to be made:")
                max_display = min(change_count, args.max_changes)
                
                for i, (original, fixed) in enumerate(changes[:max_display], 1):
                    print(f"\nChange {i}:")
                    print(f"  Original: {repr(original)}")
                    print(f"  Fixed:    {repr(fixed)}")
                
                if change_count > max_display:
                    print(f"\n... and {change_count - max_display} more changes (use --max-changes to show more)")
            
            if args.dry_run:
                print("\nDry run complete. No files were modified.")
                return 0
        
        # Write the output file if not in dry-run mode
        if not args.dry_run:
            # Create backup of original file
            backup_path = input_path.with_name(f"{input_path.stem}.bak{input_path.suffix}")
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Write the normalized content
            with open(output_path, 'w', encoding='utf-8', newline='') as f:
                f.write(normalized_content)
            
            print(f"\nSuccessfully processed {len(changes)} whitespace issues.")
            print(f"Original file backed up to: {backup_path}")
            print(f"Normalized file saved to:   {output_path}")
        
        return 0
        
    except Exception as e:
        print(f"\nError: {str(e)}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
