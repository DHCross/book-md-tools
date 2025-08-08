#!/usr/bin/env python3
"""
Fix OCR (Optical Character Recognition) Errors in Yggsburgh Document

This script fixes systematic OCR errors that were introduced during document scanning,
particularly in character stat blocks and throughout the text.
"""

import re
import sys
from datetime import datetime

def fix_ocr_errors(content):
    """Fix common OCR errors throughout the document."""
    changes_made = []
    original_content = content
    
    # Define OCR error mappings (original_error -> correct_spelling)
    ocr_corrections = {
        # Character stats and RPG terms
        'ueutral': 'neutral',
        'humau': 'human',
        'leeel': 'level',
        'eital': 'vital',
        'siguificaut': 'significant',
        'lougsword': 'longsword',
        'aud': 'and',
        'chaiumail': 'chainmail',
        'moruiugstar': 'morningstar',
        'spliut': 'splint',
        'halfliug': 'halfling',
        'guome': 'gnome',
        'eariable': 'variable',
        'eeil': 'evil',
        'cau': 'can',
        'followiug': 'following',
        'uumber': 'number',
        'uautical': 'nautical',
        'thespiau': 'thespian',
        'busiuess': 'business',
        'bullyiug': 'bullying',
        'swiudliug': 'swindling',
        'suboruiug': 'suborning',
        'illusiouist': 'illusionist',
        'protectiou': 'protection',
        'displacemeut': 'displacement',
        'batou': 'baton',
        'riug': 'ring',
        'streugth': 'strength',
        'coufers': 'confers',
        'turuiug': 'turning',
        'stuuuiug': 'stunning',
        'iute': 'into',
        'equipmeut': 'equipment',
        'clothiug': 'clothing',
        'eestmeuts': 'vestments',
        
        # Ordinal numbers
        '1st': '1st',  # Keep as is
        '2ud': '2nd',
        '3rd': '3rd',  # Keep as is
        '4th': '4th',  # Keep as is
        '5th': '5th',  # Keep as is
        '6th': '6th',  # Keep as is
        '7th': '7th',  # Keep as is
        '8th': '8th',  # Keep as is
        '9th': '9th',  # Keep as is
        
        # Common words
        'ou': 'on',  # Only when clearly an error
        'wheu': 'when',
        'irate': 'irate',  # Keep as is - this one might be correct
        'pau': 'pan',
        'piu': 'pin',
        'heaey': 'heavy',
        'fryiug': 'frying',
        'rolliug': 'rolling',
        'auy': 'any',
        'haudy': 'handy',
        'weapou': 'weapon',
        'Aligumeut': 'Alignment',
        'Poiuts': 'Points',
        'Hit Poiuts': 'Hit Points',
        'EQ': 'Equipment',
        'PA': 'Prime Attributes',
        'SA': 'Significant Attributes',
    }
    
    # Apply corrections
    for error, correction in ocr_corrections.items():
        if error in content:
            # Count occurrences
            count = content.count(error)
            if count > 0:
                content = content.replace(error, correction)
                changes_made.append(f"Fixed '{error}' → '{correction}' ({count} occurrences)")
    
    # Fix specific character stat block formatting issues
    # Fix equipment list formatting in stat blocks
    content = re.sub(r'\*\([^)]*EQ ([^)]*)\.\)\*', 
                     lambda m: f"*(Equipment: {m.group(1)})*", 
                     content)
    
    # Fix alignment formatting in stat blocks  
    content = re.sub(r'\*\(([^)]*), ([^,]*), ([^,]*), ([^)]*leeel[^)]*)\)', 
                     lambda m: f"*({m.group(1)}, {m.group(2)}, {m.group(3)} {m.group(4)})*", 
                     content)
    
    # Count total changes
    total_changes = len([c for c in changes_made if 'occurrences)' in c])
    
    return content, changes_made

def main():
    input_file = 'Yggsburgh-final_header_corrected_v7_final.md'
    
    # Read the input file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Could not find {input_file}")
        return 1
    
    print(f"Processing {input_file}...")
    print("Fixing OCR errors...")
    
    # Fix OCR errors
    fixed_content, changes_made = fix_ocr_errors(content)
    
    # Generate output filename
    output_file = 'Yggsburgh-final_header_corrected_v8_final.md'
    
    # Write the fixed content
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    # Create a report
    report_file = 'Yggsburgh-final_header_corrected_v8.report'
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(f"OCR Error Correction Report - {timestamp}\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Input file: {input_file}\n")
        f.write(f"Output file: {output_file}\n")
        f.write(f"Total corrections made: {len(changes_made)}\n\n")
        
        if changes_made:
            f.write("OCR Corrections Applied:\n")
            f.write("-" * 30 + "\n")
            for i, change in enumerate(changes_made, 1):
                f.write(f"{i}. {change}\n")
        else:
            f.write("No OCR errors found.\n")
    
    print(f"✓ Fixed OCR errors")
    print(f"✓ Output written to: {output_file}")
    print(f"✓ Report written to: {report_file}")
    print(f"✓ Total corrections made: {len(changes_made)}")
    
    if changes_made:
        print("\nSample corrections:")
        for change in changes_made[:10]:  # Show first 10 changes
            print(f"  • {change}")
        if len(changes_made) > 10:
            print(f"  ... and {len(changes_made) - 10} more (see report file)")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
