#!/usr/bin/env python3
"""Fix remaining issues in the Essential Places document."""

import re
from pathlib import Path
from typing import List, Tuple, Optional

# Configuration
MAX_PARAGRAPH_LENGTH = 600  # Target max characters per paragraph
MIN_PARAGRAPH_LENGTH = 200  # Minimum length before considering a split
SPLIT_PATTERNS = [
    r'(?<=[.!?])\s+(?=[A-Z][a-z])',  # After sentence end, before capital
    r';\s+',  # Semicolons
    r',\s+(?:and|but|or|so|yet|for|nor)\s+',  # Before conjunctions
    r'\s+—\s+',  # Em dashes
    r'\s+\*\*\s+',  # Double asterisks (for bold text)
    r'\n\s*\n'  # Existing paragraph breaks
]

def split_long_paragraphs(text: str) -> str:
    """Split long paragraphs into more readable chunks."""
    paragraphs = text.split('\n\n')
    result = []
    
    for para in paragraphs:
        # Skip if not a regular paragraph (tables, lists, headers)
        if (len(para) <= MAX_PARAGRAPH_LENGTH or 
            para.startswith('|') or 
            para.startswith(('#', '*', '-', '>', '{{'))):
            result.append(para)
            continue
            
        # Try to split at natural break points
        current = para
        while len(current) > MAX_PARAGRAPH_LENGTH:
            # Look for the best split point
            split_pos = -1
            for pattern in SPLIT_PATTERNS:
                matches = list(re.finditer(pattern, current[MAX_PARAGRAPH_LENGTH//2:MAX_PARAGRAPH_LENGTH*2], re.MULTILINE))
                if matches:
                    split_pos = matches[-1].end() + (len(current) - len(current[MAX_PARAGRAPH_LENGTH//2:MAX_PARAGRAPH_LENGTH*2]))
                    if split_pos > MIN_PARAGRAPH_LENGTH:
                        break
            
            if split_pos > 0:
                result.append(current[:split_pos].strip())
                current = current[split_pos:].strip()
            else:
                # No good split found, just split at the space after MAX_LENGTH
                space_pos = current.rfind(' ', MAX_PARAGRAPH_LENGTH-50, MAX_PARAGRAPH_LENGTH+50)
                if space_pos > 0:
                    result.append(current[:space_pos].strip())
                    current = current[space_pos:].strip()
                else:
                    # Last resort: hard split
                    result.append(current[:MAX_PARAGRAPH_LENGTH])
                    current = current[MAX_PARAGRAPH_LENGTH:]
        
        if current.strip():
            result.append(current.strip())
    
    return '\n\n'.join(result)

def fix_double_spaces(text: str) -> str:
    """Replace double spaces with single spaces, preserving markdown structure."""
    # Don't replace in code blocks
    lines = text.split('\n')
    in_code_block = False
    
    for i, line in enumerate(lines):
        if line.strip().startswith('```'):
            in_code_block = not in_code_block
            continue
            
        if not in_code_block and '  ' in line:
            # Preserve markdown line breaks (two spaces at end of line)
            if not line.rstrip().endswith('  '):
                lines[i] = re.sub(r' +', ' ', line)
    
    return '\n'.join(lines)

def fix_markdown_issues(file_path: Path) -> None:
    """Fix remaining markdown issues in the file."""
    # Read the file
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    
    print(f"Original length: {len(content)} characters")
    
    # Apply fixes
    content = fix_double_spaces(content)
    content = split_long_paragraphs(content)
    
    # Ensure proper newlines at end of file
    if not content.endswith('\n'):
        content += '\n'
    # Write the fixed content
    output_path = file_path.with_name(f"{file_path.stem}_final{file_path.suffix}")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fixed content written to: {output_path}")
    print(f"New length: {len(content)} characters")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python fix_remaining_issues.py <markdown_file>")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    fix_markdown_issues(file_path)
