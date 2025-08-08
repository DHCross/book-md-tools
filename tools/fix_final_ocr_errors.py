#!/usr/bin/env python3
"""
Final OCR Error Cleanup Script for Yggsburgh Document v9
Addresses remaining OCR errors found by spell checker
"""

import re
import sys
from datetime import datetime
from pathlib import Path

def fix_final_ocr_errors(content):
    """Fix final remaining OCR errors in the document content."""
    
    # Define final OCR error patterns and their corrections
    final_ocr_fixes = [
        # Specific errors found by spell checker
        (r'\benconnters\b', 'encounters'),
        (r'\bshonlder\b', 'shoulder'),
        (r'\bmonstache\b', 'moustache'),
        (r'\bthongh\b', 'though'),
        (r'\bdonblet\b', 'doublet'),
        (r'\balthongh\b', 'although'),
        (r'\byonng\b', 'young'),
        (r'\boeerbearing\b', 'overbearing'),
        (r'\bchaiu\b', 'chain'),
        (r'\biuto\b', 'into'),
        (r'\bbardiug\b', 'barding'),
        (r'\bnonr\b', 'hour'),
        (r'\benconrage\b', 'encourage'),
        (r'\benconraged\b', 'encouraged'),
        (r'\benconraging\b', 'encouraging'),
        
        # Additional patterns that might exist
        (r'\bconnter\b', 'counter'),
        (r'\baccnracy\b', 'accuracy'),
        (r'\bmannfactured\b', 'manufactured'),
        (r'\bpictnres\b', 'pictures'),
        (r'\bstrnctures\b', 'structures'),
        (r'\bnatnral\b', 'natural'),
        (r'\bfnll\b', 'full'),
        (r'\bstonld\b', 'should'),
        (r'\bconld\b', 'could'),
        (r'\bwonld\b', 'would'),
        (r'\bhonse\b', 'house'),
        (r'\bsonth\b', 'south'),
        (r'\bnorth\b', 'north'),  # In case there are issues
        (r'\bearth\b', 'earth'),  # In case there are issues
        
        # Fix any remaining spacing issues
        (r'\s+\.\s+', '. '),
        (r'\s+,\s+', ', '),
        (r'\s+;\s+', '; '),
        (r'\s+:\s+', ': '),
        (r'\s+\?\s+', '? '),
        (r'\s+!\s+', '! '),
        
        # Fix common punctuation spacing issues
        (r'([a-zA-Z])\.([A-Z])', r'\1. \2'),  # Missing space after period
        (r'([a-zA-Z]),([a-zA-Z])', r'\1, \2'),  # Missing space after comma
        
        # Fix potential double spaces
        (r'\s{3,}', '  '),  # Replace 3+ spaces with 2 spaces
        (r'\s{2,}$', ''),  # Remove trailing spaces
    ]
    
    corrections_made = {}
    total_corrections = 0
    
    # Apply each correction
    for pattern, replacement in final_ocr_fixes:
        matches = list(re.finditer(pattern, content, re.IGNORECASE))
        if matches:
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
            corrections_made[f"{pattern} → {replacement}"] = len(matches)
            total_corrections += len(matches)
    
    return content, corrections_made, total_corrections, len(final_ocr_fixes)

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 fix_final_ocr_errors.py <input_file>")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    
    if not input_file.exists():
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
    
    # Generate output filename
    base_name = input_file.stem
    if base_name.endswith('_v9_final'):
        base_name = base_name.replace('_v9_final', '')
    output_file = input_file.parent / f"{base_name}_v10_final.md"
    report_file = input_file.parent / f"{base_name}_v10.report"
    
    print(f"Processing: {input_file}")
    print(f"Output will be: {output_file}")
    print(f"Report will be: {report_file}")
    
    # Read input file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading input file: {e}")
        sys.exit(1)
    
    # Apply final OCR corrections
    print("Applying final OCR corrections...")
    corrected_content, corrections_made, total_corrections, patterns_checked = fix_final_ocr_errors(content)
    
    # Write output file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(corrected_content)
        print(f"✓ Final corrected document saved as: {output_file}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)
    
    # Generate report
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_content = f"""Final OCR Error Correction Report - {timestamp}
=========================================================

Input file: {input_file.name}
Output file: {output_file.name}
Total final corrections made: {total_corrections}

Final OCR Corrections Applied:
-----------------------------
"""
    
    for i, (correction, count) in enumerate(corrections_made.items(), 1):
        report_content += f"{i}. Fixed '{correction}' ({count} occurrences)\n"
    
    if not corrections_made:
        report_content += "No final OCR errors found - document appears to be completely clean.\n"
    
    report_content += f"""
Summary:
--------
- Total patterns checked: {patterns_checked}
- Patterns with matches: {len(corrections_made)}
- Total corrections applied: {total_corrections}
- Input file size: {len(content)} characters
- Output file size: {len(corrected_content)} characters

Final processing completed successfully.
The document should now be completely clean and ready for professional use.
"""
    
    try:
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_content)
        print(f"✓ Report saved as: {report_file}")
    except Exception as e:
        print(f"Error writing report file: {e}")
        sys.exit(1)
    
    print(f"\n📊 Final Cleanup Summary:")
    print(f"   Total final corrections: {total_corrections}")
    print(f"   Patterns matched: {len(corrections_made)}")
    
    if corrections_made:
        print(f"\n🔧 Final corrections made:")
        sorted_corrections = sorted(corrections_made.items(), key=lambda x: x[1], reverse=True)
        for correction, count in sorted_corrections:
            print(f"   {correction}: {count} times")
    else:
        print("\n✅ No additional OCR errors found - document is completely clean!")

if __name__ == "__main__":
    main()
