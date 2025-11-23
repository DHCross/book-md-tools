#!/usr/bin/env python3
"""
Integrated Markdown cleanup pipeline for TLG/Yggsburgh

Runs a deterministic sequence of existing fixers and QC tools against a Markdown file.
Outputs a versioned, fully processed .md plus individual reports in ./reports.

Usage:
  python3 scripts/book_pipeline.py <input.md> [--out-suffix _pipeline]

Notes:
- Uses in-repo modules; no external deps.
- Final output filenames are automatically versioned with a -vN suffix (e.g., -v1, -v2).
"""
import argparse
import sys
from pathlib import Path
from datetime import datetime
import json
import os
try:
    import tomllib
except ImportError:
    # For Python < 3.11, use the tomli package
    # pip install tomli
    import tomli as tomllib

# Import local tools
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import deinterleaver
from scripts.deinterleaver import deinterleave_content

# New imports for the synchronized pipeline
from tools.image_reference_remover import remove_image_references # New
from tools.blockquote_remover import BlockquoteRemover # New
import tools.advanced_break_fixer as advanced_break_fixer # New (replaces fix_broken_paragraphs)
from tools.markdown_cleanup_fixer import MarkdownCleanupFixer # New
from tools.markdown_validator import MarkdownValidator # New

# Import our enhanced formatter
from scripts.fix_formatting import MarkdownFormattingFixer
from scripts.book_pipeline_utils import normalize_dice_notation, clean_common_ocr_artifacts
import scripts.cnc_stat_parser as cnc_parser

# Existing imports
from tools.markdown_header_depth_corrector import HeaderCorrector
import tools.fix_table_formatting as fix_table_formatting
import tools.fix_ocr_errors as fix_ocr_errors
import tools.fix_additional_ocr_errors as fix_additional_ocr_errors
from tools.spell_check import SpellChecker
from tools.long_line_detector import LongLineDetector
from tools.paragraph_break_detector import ParagraphBreakDetector
from tools import fix_toc_plain
from tools.remove_isolated_page_numbers import remove_isolated_page_numbers


REPORTS_DIR = Path(__file__).resolve().parent.parent / 'reports'
REPORTS_DIR.mkdir(exist_ok=True)


def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def read_text(path: Path) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def _next_versioned_path(directory: Path, base_name: str, ext: str = '.md') -> Path:
    """Return next available versioned path like '<base_name>-vN.ext' in directory."""
    n = 1
    while True:
        candidate = directory / f"{base_name}-v{n}{ext}"
        if not candidate.exists():
            return candidate
        n += 1

def load_config() -> dict:
    """Loads pipeline config from pyproject.toml."""
    pyproject_path = Path(__file__).resolve().parent.parent / 'pyproject.toml'
    if not pyproject_path.exists():
        return {}

    with open(pyproject_path, 'rb') as f:
        try:
            toml_data = tomllib.load(f)
            return toml_data.get('tool', {}).get('book-pipeline', {})
        except tomllib.TOMLDecodeError:
            print("Warning: Could not decode pyproject.toml.", file=sys.stderr)
            return {}

def pipeline(input_md: Path, config: dict) -> dict:
    if not input_md.exists():
        raise FileNotFoundError(f"Input file not found: {input_md}")

    ts = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    summary = {
        'input': str(input_md),
        'timestamp': ts,
        'steps': []
    }

    # This will hold the content in memory
    current_content = read_text(input_md)

    # =================================================================================
    # STAGE 0: Deinterleaving (for two-column sources)
    # =================================================================================

    # Step 0: Deinterleaver (New Tool for chaotic two-column sources)
    try:
        # Check if content appears to need deinterleaving
        import re
        # Look for signs of interleaved content throughout the entire document
        lines = current_content.split('\n')
        interleaved_indicators = 0
        examples = []
        
        for line_num, line in enumerate(lines, 1):
            line_stripped = line.strip()
            if len(line_stripped) > 20:  # Only check substantial lines
                if re.search(r'[a-z][A-Z]', line_stripped):  # lowercase followed by uppercase
                    interleaved_indicators += 1
                    if len(examples) < 5:  # Keep first 5 examples for reporting
                        examples.append(f"Line {line_num}: {line_stripped[:80]}...")
        
        if interleaved_indicators > 2:  # If we find multiple indicators, apply deinterleaving
            original_content = current_content
            current_content = deinterleave_content(current_content)
            deint_report = REPORTS_DIR / f"{input_md.stem}_deinterleaving_{ts}.report.md"
            report_lines = [
                f"Deinterleaving Analysis Report",
                f"Input file: {input_md.name}",
                f"Interleaved content indicators found: {interleaved_indicators}",
                f"Deinterleaving applied: Yes",
                "",
                "Examples of detected interleaved content:",
            ]
            report_lines.extend(examples)
            report_lines.extend([
                "",
                "Note: Original two-column content has been reorganized into sequential format.",
                "Left column content appears first, followed by right column content."
            ])
            write_text(deint_report, '\n'.join(report_lines))
            summary['steps'].append({'step': '0_deinterleave', 'report': str(deint_report), 'indicators': interleaved_indicators, 'applied': True})
        else:
            # No deinterleaving needed
            summary['steps'].append({'step': '0_deinterleave', 'applied': False, 'indicators': interleaved_indicators})
    except Exception as e:
        summary['steps'].append({'step': '0_deinterleave', 'error': str(e)})

    # =================================================================================
    # STAGE 1: Pre-processing and Initial Cleanup
    # =================================================================================

    # Step 1: TOC Fix
    try:
        current_content, toc_changes = fix_toc_plain.fix_toc_plain(current_content)
        toc_report = REPORTS_DIR / f"{input_md.stem}_toc_{ts}.report.md"
        write_text(toc_report, f"TOC normalization changes: {toc_changes}\n")
        summary['steps'].append({'step': '1_fix_toc_plain', 'report': str(toc_report), 'changes': int(toc_changes)})
    except Exception as e:
        summary['steps'].append({'step': '1_fix_toc_plain', 'error': str(e)})

    # Step 2: Image Remover
    try:
        current_content, removals_made, removed_images = remove_image_references(current_content)
        img_report = REPORTS_DIR / f"{input_md.stem}_img_removal_{ts}.report.md"
        report_body = [f"Removed {removals_made} image references.", ""]
        report_body.extend(removed_images)
        write_text(img_report, "\n".join(report_body))
        summary['steps'].append({'step': '2_remove_images', 'report': str(img_report), 'removals': removals_made})
    except Exception as e:
        summary['steps'].append({'step': '2_remove_images', 'error': str(e)})

    # Step 3: Blockquote Remover
    try:
        remover = BlockquoteRemover()
        current_content = remover.remove_blockquotes(current_content)
        bq_report_path = REPORTS_DIR / f"{input_md.stem}_blockquote_removal_{ts}.report.md"
        write_text(bq_report_path, remover.generate_report(str(input_md)))
        summary['steps'].append({'step': '3_remove_blockquotes', 'report': str(bq_report_path), 'removals': remover.blockquotes_removed})
    except Exception as e:
        summary['steps'].append({'step': '3_remove_blockquotes', 'error': str(e)})

    # Step 4: Page Number Remover
    try:
        current_content, removed_count, removed_lines = remove_isolated_page_numbers(current_content)
        pages_report = REPORTS_DIR / f"{input_md.stem}_removed_pages_{ts}.report.md"
        report_body = [f"Removed isolated page numbers: {removed_count}", "", "Examples removed (first 50):"]
        report_body.extend(f"- {ex!r}" for ex in removed_lines[:50])
        write_text(pages_report, "\n".join(report_body))
        summary['steps'].append({'step': '4_remove_page_numbers', 'report': str(pages_report), 'removed': int(removed_count)})
    except Exception as e:
        summary['steps'].append({'step': '4_remove_page_numbers', 'error': str(e)})

    # =================================================================================
    # STAGE 2: Structural Fixing
    # =================================================================================

    # Step 5: Enhanced Markdown Formatter (Consolidated)
    try:
        # Configure the formatter with pipeline settings
        formatter_config = {
            'max_header_depth': config.get('max_header_depth', 4),
            'fix_hierarchy': True,
            'enable_break_fixing': True,
            'enable_cleanup': True
        }
        
        # Initialize the formatter with config
        formatter = MarkdownFormattingFixer(config=formatter_config)
        
        # Track initial state
        initial_line_count = len(current_content.splitlines())
        
        # Apply comprehensive formatting
        current_content = formatter.fix_content(current_content)
        changes_made = len(formatter.changes)
        
        # Generate detailed report
        formatter_report = REPORTS_DIR / f"{input_md.stem}_formatting_{ts}.report.md"
        report_content = [
            "# Markdown Formatting Report\n",
            f"Changes made: {changes_made}",
            "\n## Summary of Changes",
            "- Line break and paragraph fixes",
            "- Header hierarchy and formatting",
            "- Special label normalization",
            "- Merged word fixes",
            "- Markdown cleanup and validation",
            "\n## First 100 Changes (of {changes_made}):",
            "\n".join(str(change) for change in formatter.changes[:100])
        ]
        
        write_text(formatter_report, "\n".join(report_content))
        summary['steps'].append({
            'step': '5_markdown_formatting',
            'report': str(formatter_report),
            'changes': changes_made,
            'config': formatter_config
        })
    except Exception as e:
        summary['steps'].append({'step': '5_markdown_formatting', 'error': str(e)})

    # Step 6: Long Line Fixer (Placeholder - to be implemented)
    summary['steps'].append({
        'step': '6_fix_long_lines',
        'status': 'SKIPPED - requires refactor of long_line_detector.py'
    })

    # =================================================================================
    # STAGE 3: Content and Formatting Fixes
    # =================================================================================

    # Step 9: Table Fixer
    try:
        current_content, tbl_changes = fix_table_formatting.fix_table_formatting(current_content)
        tbl_report = REPORTS_DIR / f"{input_md.stem}_tables_{ts}.report.md"
        tbl_body = 'Table Formatting Changes:\n' + '\n'.join(f"- {c}" for c in tbl_changes) if tbl_changes else 'No table formatting changes'
        write_text(tbl_report, tbl_body)
        summary['steps'].append({'step': '9_fix_tables', 'report': str(tbl_report), 'changes': len(tbl_changes)})
    except Exception as e:
        summary['steps'].append({'step': '9_fix_tables', 'error': str(e)})

    # Step 10: OCR Fixer
    try:
        current_content, ocr_changes = fix_ocr_errors.fix_ocr_errors(current_content)
        ocr_report = REPORTS_DIR / f"{input_md.stem}_ocr_{ts}.report.md"
        ocr_body = 'OCR Corrections Applied\n' + '\n'.join(f"- {c}" for c in ocr_changes) if ocr_changes else 'No OCR corrections'
        write_text(ocr_report, ocr_body)
        summary['steps'].append({'step': '10a_fix_ocr_base', 'report': str(ocr_report), 'changes': len(ocr_changes)})

        current_content, add_map, add_total, _ = fix_additional_ocr_errors.fix_additional_ocr_errors(current_content)
        add_report = REPORTS_DIR / f"{input_md.stem}_ocr_additional_{ts}.report.md"
        add_lines = [f"Total additional corrections: {add_total}", f"Patterns matched: {len(add_map)}", "", "Details:"]
        add_lines += [f"- {k}: {v}" for k, v in add_map.items()]
        write_text(add_report, '\n'.join(add_lines))
        summary['steps'].append({'step': '10b_fix_ocr_additional', 'report': str(add_report), 'changes': int(add_total)})
    except Exception as e:
        summary['steps'].append({'step': '10_fix_ocr', 'error': str(e)})

    try:
        current_content = clean_common_ocr_artifacts(current_content)
        current_content = normalize_dice_notation(current_content)
        summary['steps'].append({'step': '10c_cnc_text_cleanup', 'applied': True})
    except Exception as e:
        summary['steps'].append({'step': '10c_cnc_text_cleanup', 'error': str(e)})

    # =================================================================================
    # STAGE 4: Final Output and QC Reports
    # =================================================================================

    out_suffix = config.get('out_suffix', '_pipeline')
    base_name = f"{input_md.stem}{out_suffix}"
    final_out = _next_versioned_path(input_md.parent, base_name, '.md')
    write_text(final_out, current_content)
    summary['final_output'] = str(final_out)

    if os.environ.get('TABLES_INLINE', '0') == '1':
        try:
            from tools import md_tables_to_tsv_inline as tsv_inline
            final_content = read_text(final_out)
            converted_text, n = tsv_inline.convert_tables(final_content)
            write_text(final_out, converted_text)
            summary['steps'].append({'step': '11_tables_inline_tsv', 'converted': int(n)})
        except Exception as e:
            summary['steps'].append({'step': '11_tables_inline_tsv', 'error': str(e)})

    # QC Step 1: Spell Check
    sc = SpellChecker()
    final_text = read_text(final_out)

    try:
        stat_blocks = cnc_parser.extract_stat_blocks(final_text)
        if stat_blocks:
            json_output = final_out.with_suffix('.json')
            with open(json_output, 'w', encoding='utf-8') as f:
                json.dump(stat_blocks, f, indent=2)
            summary['steps'].append({
                'step': 'STAT_cnc_stat_blocks',
                'file': str(json_output),
                'count': len(stat_blocks)
            })
        else:
            summary['steps'].append({
                'step': 'STAT_cnc_stat_blocks',
                'count': 0
            })
    except Exception as e:
        summary['steps'].append({'step': 'STAT_cnc_stat_blocks', 'error': str(e)})

    potential_errors = sc.check_document(final_text)
    spell_report = REPORTS_DIR / f"{input_md.stem}_spell_{ts}.txt"
    total_words = len(sc.extract_words(final_text))
    header = [f"Spell Check Report - {ts}", f"Input: {final_out.name}", f"Total words: {total_words}", f"Potential errors: {len(potential_errors)}", "", "Top items:"]
    body = [f"{word}: {count}" for word, count in potential_errors[:100]]
    write_text(spell_report, '\n'.join(header + body))
    summary['steps'].append({'step': 'QC1_spell_check', 'report': str(spell_report), 'potential_errors': len(potential_errors)})

    # QC Step 2: Long Line Detector
    long_line_threshold = config.get('long_line_threshold', 150)
    lld = LongLineDetector(threshold=long_line_threshold, min_sentence_length=40)
    lld.analyze_file(str(final_out), ignore_headers=True, ignore_code=True)
    longlines_report = REPORTS_DIR / f"{input_md.stem}_longlines_{ts}.txt"
    write_text(longlines_report, lld.generate_report())
    summary['steps'].append({'step': 'QC2_long_line_detector', 'report': str(longlines_report)})

    # QC Step 3: Paragraph Break Detector
    pbd = ParagraphBreakDetector()
    issues = pbd.analyze_file(str(final_out)) or []
    pbreak_report = REPORTS_DIR / f"{input_md.stem}_pbreaks_{ts}.txt"
    write_text(pbreak_report, '\n'.join(issues) if issues else 'No issues detected')
    summary['steps'].append({'step': 'QC3_paragraph_break_detector', 'report': str(pbreak_report), 'issues': len(issues)})

    # QC Step 4: Final Validation
    validator = MarkdownValidator()
    validation_issues = validator.analyze_content(final_text)
    validation_report = REPORTS_DIR / f"{input_md.stem}_validation_{ts}.txt"
    if validation_issues:
        write_text(validation_report, '\n'.join(validation_issues))
    else:
        write_text(validation_report, 'No validation issues found.')
    summary['steps'].append({'step': 'QC4_final_validation', 'report': str(validation_report), 'issues': len(validation_issues)})


    # Summary file
    summary_path = REPORTS_DIR / f"{input_md.stem}_pipeline_summary_{ts}.json"
    write_text(summary_path, json.dumps(summary, indent=2))

    return summary


def main():
    config = load_config()

    ap = argparse.ArgumentParser(description='Run integrated Markdown cleanup pipeline')
    ap.add_argument('input_md', help='Input Markdown file')
    ap.add_argument('--out-suffix',
                    default=config.get('out_suffix', '_pipeline'),
                    help=f"Suffix for final output filename (default: {config.get('out_suffix', '_pipeline')}).")
    args = ap.parse_args()

    # Pass command-line args and config to pipeline
    pipeline_config = config.copy()
    # Let command-line override the config file
    if args.out_suffix != config.get('out_suffix', '_pipeline'):
        pipeline_config['out_suffix'] = args.out_suffix

    input_md = Path(args.input_md).resolve()
    summary = pipeline(input_md, pipeline_config)

    print('\n=== Pipeline complete ===')
    print(f"Input:  {summary['input']}")
    print(f"Output: {summary['final_output']}")
    print('\nSteps executed:')
    for step in summary['steps']:
        status = 'ERROR' if 'error' in step else 'OK'
        details = f" (error: {step['error']})" if 'error' in step else ''
        print(f"- {step['step']}: {status}{details}")


if __name__ == '__main__':
    sys.exit(main())
