#!/usr/bin/env python3
"""
Image Reference Remover for Markdown Files
Created for the TLG publishing workflow.

This script removes all image references from Markdown files that are created
during document conversion (PDF → DOCX → Markdown). These image references
are typically not needed in the final layout and should be cleaned up.

Removes patterns like:
- ![](./images/media/image1.png)
- ![alt text](path/to/image.jpg)
- ![description](images/figure.png)

Version: 1.0
Author: TLG Publishing Workflow Assistant
"""

import re
import sys
import argparse
import os

def remove_image_references(content):
    """Remove all image references from Markdown content"""
    lines = content.split('\n')
    cleaned_lines = []
    removals_made = 0
    removed_images = []
    
    for line_num, line in enumerate(lines, 1):
        original_line = line
        
        # Pattern 1: Standard markdown image syntax ![alt](path)
        image_pattern = r'!\[.*?\]\([^)]*\)'
        matches = re.findall(image_pattern, line)
        if matches:
            for match in matches:
                removed_images.append(f"Line {line_num}: {match}")
            line = re.sub(image_pattern, '', line)
            removals_made += len(matches)
        
        # Pattern 2: Image references without alt text ![](path)
        empty_alt_pattern = r'!\[\]\([^)]*\)'
        matches = re.findall(empty_alt_pattern, line)
        if matches:
            for match in matches:
                removed_images.append(f"Line {line_num}: {match}")
            line = re.sub(empty_alt_pattern, '', line)
            removals_made += len(matches)
        
        # Pattern 3: HTML img tags (sometimes created during conversion)
        html_img_pattern = r'<img[^>]*>'
        matches = re.findall(html_img_pattern, line, re.IGNORECASE)
        if matches:
            for match in matches:
                removed_images.append(f"Line {line_num}: {match}")
            line = re.sub(html_img_pattern, '', line, flags=re.IGNORECASE)
            removals_made += len(matches)
        
        # Clean up any double spaces that might result from removal
        line = re.sub(r'  +', ' ', line)
        line = line.strip()
        
        # Only add the line if it's not empty or if it was originally not just an image
        if line or (original_line and not re.match(r'^\s*!\[.*?\]\([^)]*\)\s*$', original_line)):
            cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines), removals_made, removed_images

def main():
    parser = argparse.ArgumentParser(
        description='Remove image references from Markdown files',
        epilog='''
Examples:
    python3 image_reference_remover.py document.md
    python3 image_reference_remover.py --output clean_document.md document.md
    python3 image_reference_remover.py --preview document.md
    
This tool was created for the TLG publishing workflow to help clean
up image references that are created during document conversion.
        '''
    )
    
    parser.add_argument('file', help='Markdown file to clean')
    parser.add_argument('--output', help='Output file (default: overwrite input)')
    parser.add_argument('--preview', action='store_true', help='Preview changes without applying them')
    parser.add_argument('--report', action='store_true', help='Generate detailed report of removed images')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.file):
        print(f"Error: File '{args.file}' not found.")
        sys.exit(1)
    
    try:
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
    
    print(f"🖼️  Removing image references from '{args.file}'...")
    
    # Apply image reference removal
    cleaned_content, removals_made, removed_images = remove_image_references(content)
    
    print(f"✅ Removed {removals_made} image references")
    
    if args.report and removed_images:
        print(f"\n📋 Detailed Report:")
        for img in removed_images:
            print(f"   {img}")
    elif removals_made == 0:
        print("   No image references found to remove")
    
    if args.preview:
        print("Preview mode - no changes written to file")
        return
    
    # Write output
    output_file = args.output or args.file
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(cleaned_content)
        print(f"📄 Clean document written to '{output_file}'")
    except Exception as e:
        print(f"Error writing file: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
