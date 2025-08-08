#!/usr/bin/env python3
"""
Convert comma-separated name lists to multi-column tab-delimited format
for InDesign table import compatibility.

This script processes the Extraordinary Book of Names file and converts
comma-separated name lists into properly formatted multi-column tables
with real TAB characters between columns.
"""

import re
import sys
import argparse
from pathlib import Path

def convert_comma_list_to_columns(text, columns_per_row=5):
    """
    Convert a comma-separated list to multi-column tab-delimited format.
    
    Args:
        text: Comma-separated text string
        columns_per_row: Number of columns per row (default 5)
    
    Returns:
        Tab-delimited multi-row string
    """
    # Split on commas and clean up each name
    names = [name.strip() for name in text.split(',') if name.strip()]
    
    # Group names into rows
    rows = []
    for i in range(0, len(names), columns_per_row):
        row = names[i:i + columns_per_row]
        # Join with real TAB characters
        rows.append('\t'.join(row))
    
    # Join rows with real RETURN characters
    return '\n'.join(rows)

def convert_dice_table_to_columns(text, columns_per_row=4):
    """
    Convert a dice roll list to multi-column tab-delimited format.
    Format: "1 Name1, 2 Name2, 3 Name3..." becomes proper dice table
    
    Args:
        text: Dice roll text string like "1 Name1, 2 Name2..."
        columns_per_row: Number of dice entries per row (default 4, so 8 columns total)
    
    Returns:
        Tab-delimited multi-row string with dice numbers and names
    """
    # Split on commas and clean up each entry
    entries = [entry.strip() for entry in text.split(',') if entry.strip()]
    
    # Parse each entry to extract dice number and name
    dice_entries = []
    for entry in entries:
        # Look for pattern like "1 Name" or "10 Name"
        match = re.match(r'^(\d+)\s+(.+)$', entry)
        if match:
            dice_num = match.group(1)
            name = match.group(2).strip()
            dice_entries.append((dice_num, name))
    
    # Group entries into rows (each row has columns_per_row dice entries)
    rows = []
    for i in range(0, len(dice_entries), columns_per_row):
        row_entries = dice_entries[i:i + columns_per_row]
        # Flatten each (dice_num, name) pair and join with tabs
        row_parts = []
        for dice_num, name in row_entries:
            row_parts.extend([dice_num, name])
        rows.append('\t'.join(row_parts))
    
    return '\n'.join(rows)

def process_file(input_file, output_file=None, columns_per_row=5):
    """
    Process the entire file, converting name lists to column format.
    
    Args:
        input_file: Path to input file
        output_file: Path to output file (if None, overwrites input)
        columns_per_row: Number of columns per row
    """
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern to match name list lines that should be converted
    # These are lines that start with **Standard**: followed by comma-separated names
    # OR **Common** (d20): followed by dice roll entries
    name_list_pattern = r'^(\*\*(?:Standard|Other|Common|First common|Second common)\*\*\s*(?:\([^)]+\))?\s*:\s*)(.+)$'
    
    lines = content.split('\n')
    converted_lines = []
    
    for line in lines:
        match = re.match(name_list_pattern, line)
        if match:
            prefix = match.group(1)
            name_text = match.group(2)
            
            # Check if this looks like a comma-separated name list
            # (has multiple commas and reasonable length)
            if name_text.count(',') >= 3 and len(name_text) > 50:
                print(f"Converting line: {line[:80]}...")
                
                # Check if this is a dice roll table (entries with dice notation like (d20) or numbered entries)
                if ('(d' in prefix and ')' in prefix) or re.search(r'^\s*\d+\s+\w+', name_text):
                    # Convert as dice table
                    converted_names = convert_dice_table_to_columns(name_text, 4)  # 4 entries per row = 8 columns
                else:
                    # Convert as regular name list
                    converted_names = convert_comma_list_to_columns(name_text, columns_per_row)
                
                # Replace the line with the prefix followed by converted names
                converted_lines.append(prefix)
                converted_lines.append('')  # Empty line after header
                converted_lines.extend(converted_names.split('\n'))
            else:
                converted_lines.append(line)
        else:
            converted_lines.append(line)
    
    # Write the result
    result_content = '\n'.join(converted_lines)
    
    if output_file is None:
        output_file = input_file
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(result_content)
    
    print(f"Conversion complete. Output written to: {output_file}")

def main():
    parser = argparse.ArgumentParser(description='Convert name lists to tab-delimited columns')
    parser.add_argument('input_file', help='Input file path')
    parser.add_argument('-o', '--output', help='Output file path (default: overwrite input)')
    parser.add_argument('-c', '--columns', type=int, default=5, 
                       help='Number of columns per row (default: 5)')
    parser.add_argument('--preview', action='store_true',
                       help='Preview changes without writing to file')
    
    args = parser.parse_args()
    
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: Input file '{args.input_file}' not found")
        sys.exit(1)
    
    if args.preview:
        print("Preview mode - showing first few conversions:")
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        name_list_pattern = r'^(\*\*(?:Standard|Other|Common|First common|Second common)\*\*\s*(?:\([^)]+\))?\s*:\s*)(.+)$'
        lines = content.split('\n')
        
        count = 0
        for line in lines:
            match = re.match(name_list_pattern, line)
            if match and count < 3:
                prefix = match.group(1)
                name_text = match.group(2)
                
                if name_text.count(',') >= 3 and len(name_text) > 50:
                    print(f"\nOriginal: {line[:100]}...")
                    
                    # Check if this is a dice roll table
                    if ('(d' in prefix and ')' in prefix) or re.search(r'^\s*\d+\s+\w+', name_text):
                        converted = convert_dice_table_to_columns(name_text, 4)
                        print(f"Converted dice table to:\n{prefix}")
                    else:
                        converted = convert_comma_list_to_columns(name_text, args.columns)
                        print(f"Converted name list to:\n{prefix}")
                    
                    print(converted[:200] + "..." if len(converted) > 200 else converted)
                    count += 1
        
        if count == 0:
            print("No name lists found to convert")
    else:
        process_file(input_path, args.output, args.columns)

if __name__ == '__main__':
    main()
