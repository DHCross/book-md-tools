#!/usr/bin/env python3
"""
Fix Table Formatting Issues in Yggsburgh Document

This script fixes broken table entries where prices and descriptions
are split across multiple lines, particularly in the armor/weapons pricing sections.
"""

import re
import sys
from datetime import datetime

def fix_table_formatting(content):
    """Fix broken table formatting issues."""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    changes_made = []
    
    while i < len(lines):
        line = lines[i]
        
        # Check for broken price entries (price on one line, "point" continuation on next)
        if re.search(r'\d+gp\s*$', line.strip()) and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            
            # If next line starts with "point" or continues the price description
            if re.search(r'^(point|per point)', next_line):
                # Combine the lines
                combined_line = line.rstrip() + ' ' + next_line
                fixed_lines.append(combined_line)
                changes_made.append(f"Combined lines {i+1}-{i+2}: '{line.strip()}' + '{next_line}'")
                i += 2  # Skip the next line since we combined it
                continue
        
        # Check for broken item descriptions where price got separated
        if re.search(r'\d+gp\s+\d+gp', line) and not re.search(r'(weeks?|days?|hours?)', line):
            # This might be a line where multiple prices got merged - need manual review
            # For now, just flag it
            if '\t' not in line:  # Not already a proper table
                changes_made.append(f"Potential table formatting issue at line {i+1}: '{line.strip()}'")
        
        # Check for lines that seem to be item descriptions followed by price on next line
        if (not line.strip().startswith('**') and 
            not re.search(r'\d+gp', line) and 
            line.strip() and 
            i + 1 < len(lines)):
            
            next_line = lines[i + 1].strip()
            if re.search(r'^\d+gp(?:\s+\d+gp)*\s*$', next_line):
                # This looks like an item description with price on next line
                combined_line = line.rstrip() + ' ' + next_line
                fixed_lines.append(combined_line)
                changes_made.append(f"Combined item and price at lines {i+1}-{i+2}: '{line.strip()}' + '{next_line}'")
                i += 2
                continue
        
        # Special case: fix the specific issue mentioned
        if 'Armor, steel mail, (full chain mail), 10 weeks\' work' in line:
            # Look for the broken price continuation
            if i + 1 < len(lines) and lines[i + 1].strip() == '125gp 20gp per':
                if i + 2 < len(lines) and lines[i + 2].strip().startswith('point restored'):
                    # Combine all three lines
                    price_part = lines[i + 1].strip() + ' ' + lines[i + 2].strip()
                    combined_line = line + ' ' + price_part
                    fixed_lines.append(combined_line)
                    changes_made.append(f"Fixed armor pricing at lines {i+1}-{i+3}")
                    i += 3
                    continue
        
        # Special case: fix similar patterns
        if re.search(r'armor.*work\s*$', line, re.IGNORECASE) and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if re.search(r'^\d+gp.*per\s*$', next_line) and i + 2 < len(lines):
                third_line = lines[i + 2].strip()
                if re.search(r'^point', third_line):
                    # Combine all three lines
                    combined_line = line + ' ' + next_line + ' ' + third_line
                    fixed_lines.append(combined_line)
                    changes_made.append(f"Fixed armor pricing pattern at lines {i+1}-{i+3}")
                    i += 3
                    continue
        
        fixed_lines.append(line)
        i += 1
    
    return '\n'.join(fixed_lines), changes_made

def main():
    input_file = 'Yggsburgh-final_header_corrected_v6_final.md'
    
    # Read the input file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Could not find {input_file}")
        return 1
    
    print(f"Processing {input_file}...")
    
    # Fix table formatting
    fixed_content, changes_made = fix_table_formatting(content)
    
    # Generate output filename
    output_file = 'Yggsburgh-final_header_corrected_v7.md'
    
    # Write the fixed content
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    # Create a report
    report_file = 'Yggsburgh-final_header_corrected_v7.report'
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(f"Table Formatting Fix Report - {timestamp}\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Input file: {input_file}\n")
        f.write(f"Output file: {output_file}\n")
        f.write(f"Total changes made: {len(changes_made)}\n\n")
        
        if changes_made:
            f.write("Changes made:\n")
            f.write("-" * 20 + "\n")
            for i, change in enumerate(changes_made, 1):
                f.write(f"{i}. {change}\n")
        else:
            f.write("No changes were necessary.\n")
    
    print(f"✓ Fixed table formatting issues")
    print(f"✓ Output written to: {output_file}")
    print(f"✓ Report written to: {report_file}")
    print(f"✓ Total changes made: {len(changes_made)}")
    
    if changes_made:
        print("\nChanges made:")
        for change in changes_made[:10]:  # Show first 10 changes
            print(f"  • {change}")
        if len(changes_made) > 10:
            print(f"  ... and {len(changes_made) - 10} more (see report file)")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
