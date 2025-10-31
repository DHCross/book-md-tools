#!/usr/bin/env python3
"""
Remove first-line indentation from paragraphs in markdown files.
Preserves all other formatting, including code blocks and lists.
"""
import re
import sys
from pathlib import Path

def remove_first_line_indent(content):
    """Remove first-line indentation from paragraphs while preserving all line breaks."""
    lines = content.split('\n')
    in_code_block = False
    in_paragraph = False
    result = []
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Handle code blocks
        if stripped.startswith('```'):
            in_code_block = not in_code_block
            result.append(line)
            continue
            
        if in_code_block:
            result.append(line)
            continue
            
        # Handle empty lines (end of paragraph)
        if not stripped:
            if in_paragraph:  # Only add one empty line between paragraphs
                result.append('')
                in_paragraph = False
            result.append('')
            continue
            
        # Handle the start of a new paragraph
        if not in_paragraph:
            # Don't unindent list items or headers
            if not (stripped.startswith(('- ', '* ', '+ ')) or 
                   stripped.startswith('#')):
                line = line.lstrip()
            in_paragraph = True
        
        result.append(line)
    
    # Ensure the last line ends with a newline
    if result and result[-1]:
        result.append('')
        
    return '\n'.join(result)

def process_file(file_path):
    """Process a single markdown file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        cleaned_content = remove_first_line_indent(content)
        
        # Create backup
        backup_path = file_path + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Created backup at: {backup_path}")
        
        # Write cleaned content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(cleaned_content)
        
        print(f"Successfully removed first-line indentation from: {file_path}")
        return True
        
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
        return False

def main():
    if len(sys.argv) != 2:
        print("Usage: python remove_first_line_indent.py <markdown_file>")
        print("  This will create a backup with .bak extension")
        sys.exit(1)
    
    file_path = sys.argv[1]
    if not Path(file_path).exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    success = process_file(file_path)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
