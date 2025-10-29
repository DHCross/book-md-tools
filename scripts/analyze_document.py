#!/usr/bin/env python3
"""
Analyze a markdown document using the processing pipeline tools.
Shows what changes would be made without modifying the original file.
"""
import sys
from pathlib import Path
import json
from datetime import datetime

# Add parent directory to path to import tools
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import pipeline tools
from tools.markdown_header_depth_corrector import HeaderCorrector
from tools.markdown_cleanup_fixer import MarkdownCleanupFixer
from tools.fix_table_formatting import fix_table_formatting
from tools.fix_ocr_errors import fix_ocr_errors
from tools.fix_additional_ocr_errors import fix_additional_ocr_errors
from tools.long_line_detector import LongLineDetector

def analyze_headers(content):
    """Analyze and correct header hierarchy."""
    print("\n=== Header Analysis ===")
    corrector = HeaderCorrector(max_depth=3, fix_hierarchy=True)
    
    # Just analyze, don't modify
    analysis = corrector.analyze_headers(content)
    
    print(f"Headers found: {len(analysis['all_headers'])}")
    print("Header depth distribution:")
    for depth, count in analysis['depth_distribution'].items():
        print(f"  H{depth}: {count}")
    
    if analysis.get('has_skipped_levels', False):
        print("\nWarning: Document contains skipped header levels")
    else:
        print("No skipped header levels detected")
    
    return analysis

def analyze_formatting(content):
    """Analyze markdown formatting issues."""
    print("\n=== Formatting Analysis ===")
    fixer = MarkdownCleanupFixer()
    
    # Check for line break issues by running in dry-run mode
    fixed_content = fixer.fix_line_breaks(content, dry_run=True)
    line_break_issues = fixer.issues_found
    print(f"Potential line break issues found: {len(line_break_issues)}")
    if line_break_issues:
        print("Example issues:")
        for issue in line_break_issues[:3]:
            print(f"  - Line {issue['line_num']}: {issue['current'][:50]}...")
    
    # Check for long lines if LongLineDetector is available
    long_lines = []
    try:
        lld = LongLineDetector(threshold=120)
        # Analyze the file content
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            if len(line) > 120 and not lld.is_special_line(line):
                long_lines.append({
                    'line': i,
                    'content': line[:50] + '...' if len(line) > 50 else line,
                    'length': len(line)
                })
        print(f"Long lines (>120 chars) found: {len(long_lines)}")
        if long_lines:
            print("Example long lines:")
            for i, line in enumerate(long_lines[:3], 1):
                print(f"  {i}. Line {line['line']} ({line['length']} chars): {line['content']}")
    except Exception as e:
        print(f"Could not check for long lines: {e}")
    
    return {
        'line_break_issues': line_break_issues,
        'long_lines': long_lines
    }

def analyze_tables(content):
    """Analyze and fix table formatting."""
    print("\n=== Table Analysis ===")
    # Just get the changes that would be made
    fixed_content, changes = fix_table_formatting(content)
    
    if changes:
        print(f"Table formatting issues found: {len(changes)}")
        for i, change in enumerate(changes[:3], 1):
            print(f"  {i}. {change}")
        if len(changes) > 3:
            print(f"  ... and {len(changes) - 3} more")
    else:
        print("No table formatting issues found")
    
    return changes

def analyze_ocr_issues(content):
    """Analyze and fix OCR errors."""
    print("\n=== OCR Issue Analysis ===")
    
    # First pass OCR fixes
    fixed_content, ocr_changes = fix_ocr_errors(content)
    
    # Additional OCR fixes
    fixed_content, add_map, add_total, _ = fix_additional_ocr_errors(fixed_content)
    
    # Handle different return types from fix_ocr_errors
    if isinstance(ocr_changes, dict):
        ocr_count = len(ocr_changes)
        example_changes = list(ocr_changes.items())[:2]
    else:
        ocr_count = len(ocr_changes) if ocr_changes else 0
        example_changes = ocr_changes[:2] if ocr_changes else []
    
    total_changes = ocr_count + add_total
    print(f"Potential OCR issues found: {total_changes}")
    
    if total_changes > 0:
        print("Example changes:")
        for i, change in enumerate(example_changes, 1):
            if isinstance(change, tuple):
                old, new = change
                print(f"  {i}. '{old}' → '{new}'")
        if add_map:
            for i, (old, new) in enumerate(list(add_map.items())[:2], i + 1):
                print(f"  {i}. '{old}' → '{new}'")
    
    return {
        'ocr_changes': ocr_changes,
        'additional_ocr_changes': add_map,
        'total_changes': total_changes
    }

def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <markdown_file>")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)
    
    print(f"Analyzing: {input_path}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 50)
    
    # Read the content
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Run analyses
    header_analysis = analyze_headers(content)
    format_analysis = analyze_formatting(content)
    table_changes = analyze_tables(content)
    ocr_analysis = analyze_ocr_issues(content)
    
    # Generate summary
    print("\n=== Summary ===")
    print(f"Total potential issues found: {len(header_analysis.get('all_headers', [])) + len(format_analysis['line_break_issues']) + len(table_changes) + ocr_analysis['total_changes']}")
    print("\nRun 'python scripts/book_pipeline.py <file>' to apply all fixes.")

if __name__ == "__main__":
    main()
