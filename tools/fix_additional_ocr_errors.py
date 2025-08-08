#!/usr/bin/env python3
"""
Additional OCR Error Correction Script for Yggsburgh Document
This script addresses remaining OCR errors not caught in v8 processing.
"""

import re
import sys
from datetime import datetime
from pathlib import Path
import json
from typing import Dict, List, Tuple

def _load_overrides_from_config() -> Dict[str, str]:
    """Load optional OCR override mappings from configs/ocr_overrides.json.
    Keys are literal words/phrases (not regex). We'll apply as word-boundary, case-insensitive.
    """
    repo_root = Path(__file__).resolve().parent.parent
    cfg_path = repo_root / 'configs' / 'ocr_overrides.json'
    if cfg_path.exists():
        try:
            data = json.loads(cfg_path.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except Exception:
            pass
    return {}

def _build_regex_pairs(base_fixes: List[Tuple[str, str]], overrides: Dict[str, str]) -> List[Tuple[str, str]]:
    """Combine base regex fixes with exact-word overrides as regex pairs."""
    pairs = list(base_fixes)
    for wrong, right in overrides.items():
        # Use word boundaries for exact tokens; escape to avoid regex meta
        pattern = rf"\b{re.escape(wrong)}\b"
        pairs.append((pattern, right))
    return pairs


def fix_additional_ocr_errors(content):
    """Fix additional OCR errors in the document content."""
    
    # Define additional OCR error patterns and their corrections
    base_ocr_fixes = [
        # Basic word corrections
        (r'\bvarions\b', 'various'),
        (r'\baronnd\b', 'around'),
        (r'\babont\b', 'about'),
        (r'\byon\b', 'you'),
        (r'\bsonnding\b', 'sounding'),
        (r'\benconraged\b', 'encouraged'),
        (r'\bwonld\b', 'would'),
        (r'\bfonr\b', 'four'),
        (r'\bcansed\b', 'caused'),
        (r'\bflonrishing\b', 'flourishing'),
        (r'\bshonld\b', 'should'),
        (r'\bbecanse\b', 'because'),
        (r'\bruinons\b', 'ruinous'),
        (r"\bconldn't\b", "couldn't"),
        (r'\bwarehonse\b', 'warehouse'),
        (r'\bhonses\b', 'houses'),
        (r'\bstricture\b', 'structure'),
        (r'\bprosperons\b', 'prosperous'),
        (r'\bwithont\b', 'without'),
        (r'\bflonr\b', 'flour'),
        
        # Additional patterns found in scan
        (r'\bbnt\b', 'but'),
        (r'\babut\b', 'about'),
        (r'\bwhol\b', 'whole'),

        # Specific targeted fixes from QC review
        (r'\bEnconnters\b', 'Encounters'),
        (r'\benconnters\b', 'encounters'),
        (r'\bConncil\b', 'Council'),
        (r'\bconncil\b', 'council'),
        (r'\bConrts\b', 'Courts'),
        (r'\bconrts\b', 'courts'),
        (r'\bSonth\b', 'South'),
        (r'\bsonth\b', 'south'),
        (r'\bHonse\b', 'House'),
        (r'\bhonse\b', 'house'),

        # Common OCR confusions
        (r'\bconrt\b', 'court'),
        (r'\bcomcil\b', 'council'),
        (r'\bconntry\b', 'country'),
        (r'\bsonthern\b', 'southern'),
        (r'\bnortb\b', 'north'),
        (r'\bsoutb\b', 'south'),
        (r'\bwesl\b', 'west'),
        (r'\beasl\b', 'east'),
        (r'\bsmilh\b', 'smith'),
        (r'\bmodem\b', 'modern'),
        (r'\bclem\b', 'chem'),
        
        # Spacing and punctuation issues
        (r'\s+,\s+', ', '),  # Fix spacing around commas
        (r'\s+\.\s+', '. '), # Fix spacing around periods
        (r'\s+;\s+', '; '),  # Fix spacing around semicolons
        (r'\s+:\s+', ': '),  # Fix spacing around colons
        
        # Other common OCR mistakes
        (r'\benconrage\b', 'encourage'),
        (r'\brecnrring\b', 'recurring'),
        (r'\boccnr\b', 'occur'),
        (r'\baccnrate\b', 'accurate'),
        (r'\bsecnre\b', 'secure'),
        (r'\bfnture\b', 'future'),
        (r'\bnatnre\b', 'nature'),
        (r'\bpictnre\b', 'picture'),
        (r'\bstrncture\b', 'structure'),
        (r'\bfeatnres\b', 'features'),
        (r'\bmeasnres\b', 'measures'),
        (r'\btreasnres\b', 'treasures'),
        (r'\bcreatnes\b', 'creatures'),
        (r'\badventnres\b', 'adventures'),
        (r'\bcnlture\b', 'culture'),
        (r'\bcaptnre\b', 'capture'),
        (r'\bmannfacture\b', 'manufacture'),
    ]

    # Merge with optional overrides from configs
    overrides = _load_overrides_from_config()
    ocr_fixes = _build_regex_pairs(base_ocr_fixes, overrides)
    
    corrections_made: Dict[str, int] = {}
    total_corrections = 0
    
    # Apply each correction
    for pattern, replacement in ocr_fixes:
        matches = list(re.finditer(pattern, content, re.IGNORECASE))
        if matches:
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
            corrections_made[f"{pattern} → {replacement}"] = len(matches)
            total_corrections += len(matches)
    
    patterns_checked = len(ocr_fixes)
    return content, corrections_made, total_corrections, patterns_checked


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 fix_additional_ocr_errors.py <input_file>")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    
    if not input_file.exists():
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
    
    # Generate output filename
    base_name = input_file.stem
    if base_name.endswith('_v8_final'):
        base_name = base_name.replace('_v8_final', '')
    output_file = input_file.parent / f"{base_name}_v9_final.md"
    report_file = input_file.parent / f"{base_name}_v9.report"
    
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
    
    # Apply OCR corrections
    print("Applying additional OCR corrections...")
    corrected_content, corrections_made, total_corrections, patterns_checked = fix_additional_ocr_errors(content)
    
    # Write output file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(corrected_content)
        print(f"✓ Corrected document saved as: {output_file}")
    except Exception as e:
        print(f"Error writing output file: {e}")
        sys.exit(1)
    
    # Generate report
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_content = f"""Additional OCR Error Correction Report - {timestamp}
================================================================

Input file: {input_file.name}
Output file: {output_file.name}
Total additional corrections made: {total_corrections}

Additional OCR Corrections Applied:
----------------------------------
"""
    
    for i, (correction, count) in enumerate(corrections_made.items(), 1):
        report_content += f"{i}. Fixed '{correction}' ({count} occurrences)\n"
    
    if not corrections_made:
        report_content += "No additional OCR errors found - document appears to be clean.\n"
    
    report_content += f"""
Summary:
--------
- Total patterns checked: {patterns_checked}
- Patterns with matches: {len(corrections_made)}
- Total corrections applied: {total_corrections}
- Input file size: {len(content)} characters
- Output file size: {len(corrected_content)} characters

Processing completed successfully.
"""
    
    try:
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_content)
        print(f"✓ Report saved as: {report_file}")
    except Exception as e:
        print(f"Error writing report file: {e}")
        sys.exit(1)
    
    print(f"\n📊 Summary:")
    print(f"   Total additional corrections: {total_corrections}")
    print(f"   Patterns matched: {len(corrections_made)}")
    
    if corrections_made:
        print(f"\n🔧 Top corrections made:")
        sorted_corrections = sorted(corrections_made.items(), key=lambda x: x[1], reverse=True)
        for correction, count in sorted_corrections[:10]:
            print(f"   {correction}: {count} times")

if __name__ == "__main__":
    main()
