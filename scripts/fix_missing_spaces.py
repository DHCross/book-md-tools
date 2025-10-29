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

import re
import sys
from pathlib import Path
from typing import List, Set, Tuple
import argparse

# Common abbreviations and proper nouns that shouldn't be split
COMMON_NO_SPLIT = {
    # Common abbreviations
    'iOS', 'macOS', 'GitHub', 'Markdown', 'JavaScript', 'TypeScript',
    'NodeJS', 'Python', 'HTML', 'CSS', 'API', 'CLI', 'JSON', 'YAML',
    'XML', 'PDF', 'CSV', 'URL', 'HTTP', 'HTTPS', 'SQL', 'NoSQL',
    'AI', 'ML', 'NLP', 'OCR', 'IDE', 'VS Code', 'VS', 'Code',
    'TLG', 'Yggsburgh', 'D&D', 'RPG', 'GM', 'NPC', 'PC', 'HP', 'AC',
    # Common proper nouns (add more as needed)
    'MacBook', 'iPhone', 'iPad', 'iMac', 'AirPods', 'PlayStation',
    'Xbox', 'Nintendo', 'Netflix', 'YouTube', 'Google', 'Facebook',
    'Twitter', 'Instagram', 'LinkedIn', 'GitLab', 'Bitbucket',
    # Add any project-specific terms here
    'Yggsburgh', 'Kos', 'Yggs', 'Greyhawk', 'DungeonsAndDragons'
}

class SpaceInserter:
    def __init__(self, no_split_words: Set[str] = None):
        """Initialize with a set of words that shouldn't be split."""
        self.no_split = no_split_words or set()
        self.changes_made = 0
        
    def should_skip(self, text: str, pos: int) -> bool:
        """Determine if we should skip inserting a space at the given position."""
        # Skip if we're at the start or end of the text
        if pos <= 0 or pos >= len(text) - 1:
            return True
            
        # Check if we're in a code block or inline code
        if self._is_in_code(text, pos):
            return True
            
        # Check if we're in a URL or email
        if self._is_in_url_or_email(text, pos):
            return True
            
        # Check if the surrounding text matches a no-split pattern
        word = self._get_surrounding_word(text, pos)
        if word.lower() in (w.lower() for w in self.no_split):
            return True
            
        # Check for common patterns that shouldn't be split
        if self._is_common_pattern(text, pos):
            return True
            
        return False
    
    def _is_in_code(self, text: str, pos: int) -> bool:
        """Check if the position is within a code block or inline code."""
        # Check for inline code
        backticks = 0
        i = pos - 1
        while i >= 0 and text[i] == '`':
            backticks += 1
            i -= 1
        
        if backticks % 2 == 1:
            return True
            
        # Check for code blocks (```code```)
        if '```' in text[max(0, pos-3):pos+4]:
            return True
            
        # Check for indented code blocks
        line_start = text.rfind('\n', 0, pos) + 1
        line = text[line_start:pos]
        if line.strip() == '' and line != '':  # Indented line
            return True
            
        return False
    
    def _is_in_url_or_email(self, text: str, pos: int) -> bool:
        """Check if the position is within a URL or email address."""
        # Look for common URL/email patterns around the position
        url_patterns = [
            r'https?://\S+',  # http:// or https://
            r'www\.\S+\.\w+',  # www.example.com
            r'\S+@\S+\.\w+',  # email@example.com
            r'\S+\.(com|org|net|io|dev|md|txt|py)\b'  # file.ext
        ]
        
        for pattern in url_patterns:
            for match in re.finditer(pattern, text):
                if match.start() <= pos <= match.end():
                    return True
        return False
    
    def _get_surrounding_word(self, text: str, pos: int) -> str:
        """Get the word surrounding the given position."""
        start = pos
        while start > 0 and (text[start-1].isalpha() or text[start-1] in "'-_"):
            start -= 1
            
        end = pos + 1
        while end < len(text) and (text[end].isalpha() or text[end] in "'-_"):
            end += 1
            
        return text[start:end]
    
    def _is_common_pattern(self, text: str, pos: int) -> bool:
        """Check for common patterns that shouldn't be split."""
        # Check for common patterns like "Figure 1A" or "Chapter 2B"
        if pos > 0 and text[pos-1].isdigit() and text[pos].isupper():
            return True
            
        # Check for patterns like "Figure1" or "Table2"
        if pos > 0 and text[pos-1].isalpha() and text[pos].isdigit():
            # Check if it's a known prefix
            prefix = ''
            i = pos - 1
            while i >= 0 and text[i].isalpha():
                prefix = text[i] + prefix
                i -= 1
                
            if prefix.lower() in {'figure', 'table', 'chapter', 'section', 'part', 'appendix'}:
                return True
                
        return False
    
    def insert_spaces(self, text: str) -> Tuple[str, List[Tuple[str, str]]]:
        """
        Insert spaces between lowercase and uppercase letters in the text.
        
        Returns:
            A tuple of (fixed_text, changes) where changes is a list of
            (original, fixed) tuples.
        """
        self.changes_made = 0
        changes = []
        result = []
        i = 0
        
        while i < len(text):
            # Special case for "DesignEssential" -> "Design Essential"
            if text.startswith('DesignEssential', i):
                result.append('Design Essential')
                changes.append(('DesignEssential', 'Design Essential'))
                self.changes_made += 1
                i += len('DesignEssential')
                continue
                
            # Look for lowercase followed by uppercase
            if (i < len(text) - 1 and 
                text[i].islower() and 
                text[i+1].isupper() and 
                not self.should_skip(text, i+1)):
                
                # Get the original word for the change log
                word = self._get_surrounding_word(text, i+1)
                original = text[i:i+len(word)+1]
                fixed = text[i] + ' ' + text[i+1:i+1+len(word)]
                
                # Add to result with space
                result.append(text[i] + ' ' + text[i+1])
                changes.append((original, fixed))
                self.changes_made += 1
                i += 2
            else:
                result.append(text[i])
                i += 1
                
        return ''.join(result), changes

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
    
    # Initialize the space inserter with common no-split words
    inserter = SpaceInserter(COMMON_NO_SPLIT)
    
    # Fix missing spaces
    fixed_content, changes = inserter.insert_spaces(content)
    
    # Prepare output
    output_path = args.output or input_path.with_stem(f"{input_path.stem}_fixed")
    
    if args.dry_run or args.verbose:
        print(f"Found {inserter.changes_made} places to insert spaces.")
        if changes and args.verbose:
            print("\nChanges to be made:")
            for original, fixed in changes[:10]:  # Show first 10 changes
                print(f"  '{original}' -> '{fixed}'")
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
