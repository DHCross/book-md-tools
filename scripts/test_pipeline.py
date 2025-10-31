#!/usr/bin/env python3
"""
Test pipeline to show what changes would be made without modifying files.
"""
import sys
from pathlib import Path
from datetime import datetime
import re

# Add parent directory to path to import tools
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import pipeline tools
import pytest
from tools.markdown_header_depth_corrector import HeaderCorrector
from tools.markdown_cleanup_fixer import MarkdownCleanupFixer
from tools.fix_table_formatting import fix_table_formatting
from tools.fix_ocr_errors import fix_ocr_errors
from tools.fix_additional_ocr_errors import fix_additional_ocr_errors
from tools.long_line_detector import LongLineDetector


@pytest.fixture(scope="module")
def content():
    """Load sample markdown content for pipeline checks."""
    sample_path = Path(__file__).resolve().parent / "test_data" / "sample.md"
    return sample_path.read_text(encoding="utf-8")

def print_header(title):
    print(f"\n{'='*80}\n{title}\n{'='*80}")

def test_deinterleave(content):
    """Test if deinterleaving would be needed."""
    print_header("1. COLUMN DEINTERLEAVING CHECK")
    
    # Look for signs of interleaved content
    lines = content.split('\n')
    interleaved_indicators = 0
    examples = []
    
    for line_num, line in enumerate(lines, 1):
        line_stripped = line.strip()
        if len(line_stripped) > 20:  # Only check substantial lines
            if re.search(r'[a-z][A-Z]', line_stripped):  # lowercase followed by uppercase
                interleaved_indicators += 1
                if len(examples) < 3:  # Keep first few examples
                    examples.append(f"Line {line_num}: {line_stripped[:80]}...")
    
    if interleaved_indicators > 2:
        print(f"⚠️  {interleaved_indicators} potential interleaving indicators found")
        print("Example lines that might need deinterleaving:")
        for ex in examples:
            print(f"  - {ex}")
        print("\nThis suggests the document might be in a two-column format that needs deinterleaving.")
    else:
        print("✓ No significant interleaving detected")
    
    return interleaved_indicators > 2

def test_header_structure(content):
    """Test header hierarchy and structure."""
    print_header("2. HEADER STRUCTURE ANALYSIS")
    
    corrector = HeaderCorrector(max_depth=3, fix_hierarchy=True)
    analysis = corrector.analyze_headers(content)
    
    print(f"Headers found: {len(analysis['all_headers'])}")
    print("Header depth distribution:")
    for depth, count in analysis['depth_distribution'].items():
        print(f"  H{depth}: {count}")
    
    if analysis.get('has_skipped_levels', False):
        print("⚠️  Warning: Document contains skipped header levels")
    else:
        print("✓ Header hierarchy appears consistent")
    
    return analysis

def test_line_lengths(content):
    """Test for long lines."""
    print_header("3. LINE LENGTH ANALYSIS")
    
    lines = content.split('\n')
    long_lines = []
    
    for i, line in enumerate(lines, 1):
        if len(line) > 120 and not line.strip().startswith(('#', '>', '|', '```', '*', '-')):
            long_lines.append((i, len(line), line[:80] + '...' if len(line) > 80 else line))
    
    print(f"Found {len(long_lines)} lines longer than 120 characters")
    if long_lines:
        print("\nExample long lines:")
        for i, (line_num, length, line) in enumerate(long_lines[:3], 1):
            print(f"  {i}. Line {line_num} ({length} chars): {line}")
    
    return long_lines

def test_ocr_issues(content):
    """Test for common OCR issues."""
    print_header("4. OCR ISSUE ANALYSIS")
    
    # First pass OCR fixes
    fixed_content, ocr_changes = fix_ocr_errors(content)
    
    # Additional OCR fixes
    fixed_content, add_map, add_total, _ = fix_additional_ocr_errors(fixed_content)
    
    total_changes = len(ocr_changes) + add_total
    print(f"Found {total_changes} potential OCR issues")
    
    if total_changes > 0:
        print("\nExample changes that would be made:")
        # Show first few changes from each pass
        if isinstance(ocr_changes, dict):
            for i, (old, new) in enumerate(list(ocr_changes.items())[:2], 1):
                print(f"  {i}. '{old}' → '{new}'")
        if add_map:
            for i, (old, new) in enumerate(list(add_map.items())[:2], 3):
                print(f"  {i}. '{old}' → '{new}'")
    
    return total_changes

def test_table_formatting(content):
    """Test for table formatting issues."""
    print_header("5. TABLE FORMATTING ANALYSIS")
    
    fixed_content, changes = fix_table_formatting(content)
    
    if changes:
        print(f"Found {len(changes)} table formatting issues")
        print("\nExample changes:")
        for i, change in enumerate(changes[:2], 1):
            print(f"  {i}. {change}")
    else:
        print("✓ No table formatting issues found")
    
    return changes

def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <markdown_file>")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)
    
    print(f"\n{'='*80}")
    print(f"TESTING PIPELINE FOR: {input_path.name}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 80)
    
    # Read the content
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Run tests
    needs_deinterleave = test_deinterleave(content)
    header_analysis = test_header_structure(content)
    long_lines = test_line_lengths(content)
    ocr_issues = test_ocr_issues(content)
    table_issues = test_table_formatting(content)
    
    # Print summary
    print_header("SUMMARY")
    print(f"1. Column Deinterleaving: {'Needed' if needs_deinterleave else 'Not Needed'}")
    print(f"2. Header Structure: {len(header_analysis['all_headers'])} headers found")
    print(f"3. Long Lines: {len(long_lines)} lines > 120 characters")
    print(f"4. OCR Issues: {ocr_issues} potential fixes")
    print(f"5. Table Formatting: {len(table_issues)} issues found")
    
    print("\nThis is a test run. No files were modified.")
    print("To apply these changes, run:")
    print(f"  python3 scripts/book_pipeline.py \"{input_path}\" --out-suffix _cleaned")

if __name__ == "__main__":
    main()
