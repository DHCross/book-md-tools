#!/usr/bin/env python3
"""
Safer OCR Error Correction

This version only replaces whole words to prevent unintended substitutions.
"""

import re
from typing import Dict, List, Tuple

def fix_ocr_errors_safely(content: str) -> Tuple[str, Dict[str, str]]:
    """
    Fix common OCR errors in the content, but only when they appear as whole words.
    
    Args:
        content: The text content to fix
        
    Returns:
        Tuple of (fixed_content, changes_made) where changes_made is a dict of
        the form {original: replacement, ...}
    """
    # Define OCR error mappings (original_error -> correct_spelling)
    # Only include whole word replacements to prevent partial matches
    ocr_corrections = {
        # Character stats and RPG terms
        r'\bueutral\b': 'neutral',
        r'\bhumau\b': 'human',
        r'\bleeel\b': 'level',
        r'\beital\b': 'vital',
        r'\bsiguificaut\b': 'significant',
        r'\blougsword\b': 'longsword',
        r'\baud\b': 'and',
        r'\bchaiumail\b': 'chainmail',
        r'\bmoruiugstar\b': 'morningstar',
        r'\bspliut\b': 'splint',
        r'\bhalfliug\b': 'halfling',
        r'\bguome\b': 'gnome',
        r'\beariable\b': 'variable',
        r'\beeil\b': 'evil',
        r'\bcau\b': 'can',
        r'\bfollowiug\b': 'following',
        r'\buumber\b': 'number',
        r'\bnautical\b': 'nautical',  # Fixed typo from uautical to nautical
        r'\bthespiau\b': 'thespian',
        r'\bbusiuess\b': 'business',
        r'\bbullyiug\b': 'bullying',
        r'\bswiudliug\b': 'swindling',
        r'\bsuboruiug\b': 'suborning',
        r'\billusiouist\b': 'illusionist',
        r'\bprotectiou\b': 'protection',
        r'\bdisplacemeut\b': 'displacement',
        r'\bbatou\b': 'baton',
        r'\briug\b': 'ring',
        r'\bstreugth\b': 'strength',
        r'\bcoufers\b': 'confers',
        # Add more corrections as needed, but always as whole words
    }
    
    changes_made = {}
    fixed_content = content
    
    # Apply each correction
    for pattern, replacement in ocr_corrections.items():
        # Count occurrences before replacement
        before = len(re.findall(pattern, fixed_content, re.IGNORECASE))
        
        # Perform the replacement
        fixed_content, count = re.subn(
            pattern, 
            replacement, 
            fixed_content,
            flags=re.IGNORECASE
        )
        
        # Record the change if any were made
        if count > 0:
            changes_made[pattern] = replacement
    
    return fixed_content, changes_made

def main():
    import sys
    from pathlib import Path
    
    if len(sys.argv) != 2:
        print("Usage: python safer_fix_ocr_errors.py <input_file>")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    if not input_file.exists():
        print(f"Error: File not found: {input_file}")
        sys.exit(1)
    
    # Read the input file
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix OCR errors
    fixed_content, changes = fix_ocr_errors_safely(content)
    
    # Create output filename
    output_file = input_file.with_stem(f"{input_file.stem}_ocr_fixed")
    
    # Write the fixed content
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)
    
    # Print summary
    print(f"Fixed {sum(1 for _ in changes)} unique patterns")
    print(f"Output written to: {output_file}")
    
    if changes:
        print("\nChanges made:")
        for pattern, replacement in changes.items():
            print(f"  {pattern} -> {replacement}")

if __name__ == "__main__":
    main()
