#!/usr/bin/env python3
"""
Integrated Markdown cleanup pipeline for TLG/Yggsburgh

Runs a deterministic sequence of existing fixers and QC tools against a Markdown file.
Outputs a versioned, fully processed .md plus individual reports in ./reports.

Usage:
  python3 scripts/book_pipeline.py <input.md> [--out-suffix _pipeline]

Notes:
- Uses in-repo modules; no external deps.
- Does not require moving files to tools/ yet.
- Final output filenames are automatically versioned with a -vN suffix (e.g., -v1, -v2).
"""
import argparse
import sys
from pathlib import Path
from datetime import datetime

# Import local tools
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.markdown_header_depth_corrector import HeaderCorrector  # type: ignore
import tools.fix_broken_paragraphs as fix_broken_paragraphs  # type: ignore
import tools.fix_table_formatting as fix_table_formatting  # type: ignore
import tools.fix_ocr_errors as fix_ocr_errors  # type: ignore
import tools.fix_additional_ocr_errors as fix_additional_ocr_errors  # type: ignore
from tools.spell_check import SpellChecker  # type: ignore
from tools.long_line_detector import LongLineDetector  # type: ignore
from tools.paragraph_break_detector import ParagraphBreakDetector  # type: ignore
from tools import fix_toc_plain  # type: ignore
from tools.remove_isolated_page_numbers import remove_isolated_page_numbers  # type: ignore

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


def pipeline(input_md: Path, out_suffix: str = '_pipeline') -> dict:
    if not input_md.exists():
        raise FileNotFoundError(f"Input file not found: {input_md}")

    ts = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    summary = {
        'input': str(input_md),
        'timestamp': ts,
        'steps': []
    }

    current_file = input_md

    # 0) Normalize plain-text TOC EARLY (so header tools don't touch it)
    try:
        content = read_text(current_file)
        toc_fixed_text, toc_changes = fix_toc_plain.fix_toc_plain(content)
        toc_fixed = current_file.with_name(f"{current_file.stem}_toc{current_file.suffix}")
        write_text(toc_fixed, toc_fixed_text)
        toc_report = REPORTS_DIR / f"{input_md.stem}_toc_{ts}.report.md"
        write_text(toc_report, f"TOC normalization changes: {toc_changes}\n")
        current_file = toc_fixed
        summary['steps'].append({'step': 'fix_toc_plain', 'output': str(current_file), 'report': str(toc_report), 'changes': int(toc_changes)})
    except Exception as e:
        summary['steps'].append({'step': 'fix_toc_plain', 'error': str(e)})

    # 1) Header sanity (depth + hierarchy)
    try:
        corrector = HeaderCorrector(max_depth=4, fix_hierarchy=True)
        header_out, header_report = corrector.process_file(current_file)
        summary['steps'].append({'step': 'header_depth_correction', 'output': str(header_out), 'report': str(header_report)})
        current_file = header_out
    except Exception as e:
        summary['steps'].append({'step': 'header_depth_correction', 'error': str(e)})

    # 2) Remove isolated page numbers (early, so paragraph healing works best)
    try:
        content = read_text(current_file)
        no_pages_text, removed_count, removed_lines = remove_isolated_page_numbers(content)
        no_pages = current_file.with_name(f"{current_file.stem}_nopages{current_file.suffix}")
        write_text(no_pages, no_pages_text)
        pages_report = REPORTS_DIR / f"{input_md.stem}_removed_pages_{ts}.report.md"
        report_body = [
            f"Removed isolated page numbers: {removed_count}",
            "",
            "Examples removed (first 50):",
        ]
        for ex in removed_lines[:50]:
            report_body.append(f"- {ex!r}")
        write_text(pages_report, "\n".join(report_body))
        current_file = no_pages
        summary['steps'].append({'step': 'remove_isolated_page_numbers', 'output': str(current_file), 'report': str(pages_report), 'removed': int(removed_count)})
    except Exception as e:
        summary['steps'].append({'step': 'remove_isolated_page_numbers', 'error': str(e)})

    # 3) Fix broken paragraphs (join unintended wraps)
    try:
        para_fixed = current_file.with_name(f"{current_file.stem}_fixed_paragraphs{current_file.suffix}")
        fix_broken_paragraphs.fix_broken_paragraphs(str(current_file), str(para_fixed))
        current_file = para_fixed
        summary['steps'].append({'step': 'fix_broken_paragraphs', 'output': str(current_file)})
    except Exception as e:
        summary['steps'].append({'step': 'fix_broken_paragraphs', 'error': str(e)})

    # 4) Fix table formatting
    try:
        content = read_text(current_file)
        tbl_fixed_text, tbl_changes = fix_table_formatting.fix_table_formatting(content)
        tbl_fixed = current_file.with_name(f"{current_file.stem}_tables{current_file.suffix}")
        write_text(tbl_fixed, tbl_fixed_text)
        tbl_report = REPORTS_DIR / f"{input_md.stem}_tables_{ts}.report.md"
        if tbl_changes:
            tbl_body = 'Table Formatting Changes:\n' + '\n'.join(f"- {c}" for c in tbl_changes)
        else:
            tbl_body = 'No table formatting changes'
        write_text(tbl_report, tbl_body)
        current_file = tbl_fixed
        summary['steps'].append({'step': 'fix_table_formatting', 'output': str(current_file), 'report': str(tbl_report), 'changes': len(tbl_changes)})
    except Exception as e:
        summary['steps'].append({'step': 'fix_table_formatting', 'error': str(e)})

    # 5) OCR error passes (base)
    try:
        content = read_text(current_file)
        ocr_fixed_text, ocr_changes = fix_ocr_errors.fix_ocr_errors(content)
        ocr_fixed = current_file.with_name(f"{current_file.stem}_ocr{current_file.suffix}")
        write_text(ocr_fixed, ocr_fixed_text)
        ocr_report = REPORTS_DIR / f"{input_md.stem}_ocr_{ts}.report.md"
        if ocr_changes:
            ocr_body = 'OCR Corrections Applied\n' + '\n'.join(f"- {c}" for c in ocr_changes)
        else:
            ocr_body = 'No OCR corrections'
        write_text(ocr_report, ocr_body)
        current_file = ocr_fixed
        summary['steps'].append({'step': 'fix_ocr_errors', 'output': str(current_file), 'report': str(ocr_report), 'changes': len(ocr_changes)})
    except Exception as e:
        summary['steps'].append({'step': 'fix_ocr_errors', 'error': str(e)})

    # 6) Additional OCR pass
    try:
        content = read_text(current_file)
        add_text, add_map, add_total, patterns = fix_additional_ocr_errors.fix_additional_ocr_errors(content)
        add_fixed = current_file.with_name(f"{current_file.stem}_ocr2{current_file.suffix}")
        write_text(add_fixed, add_text)
        add_report = REPORTS_DIR / f"{input_md.stem}_ocr_additional_{ts}.report.md"
        add_lines = [f"Total additional corrections: {add_total}", f"Patterns matched: {len(add_map)}", "", "Details:"]
        add_lines += [f"- {k}: {v}" for k, v in add_map.items()]
        write_text(add_report, '\n'.join(add_lines))
        current_file = add_fixed
        summary['steps'].append({'step': 'fix_additional_ocr_errors', 'output': str(current_file), 'report': str(add_report), 'changes': int(add_total)})
    except Exception as e:
        summary['steps'].append({'step': 'fix_additional_ocr_errors', 'error': str(e)})

    # 5) Finalize output name with automatic -vN versioning
    base_name = f"{input_md.stem}{out_suffix}"
    final_out = _next_versioned_path(input_md.parent, base_name, '.md')
    # Write final content
    write_text(final_out, read_text(current_file))
    summary['final_output'] = str(final_out)

    # Optional: Convert Markdown pipe tables to inline TSV-in-document for InDesign
    import os
    if os.environ.get('TABLES_INLINE', '0') == '1':
        try:
            from tools import md_tables_to_tsv_inline as tsv_inline
            converted_text, n = tsv_inline.convert_tables(read_text(final_out))
            write_text(final_out, converted_text)
            summary['steps'].append({'step': 'tables_inline_tsv', 'converted': int(n)})
        except Exception as e:
            summary['steps'].append({'step': 'tables_inline_tsv', 'error': str(e)})

    # 6) QC: Spell check report
    sc = SpellChecker()
    final_text = read_text(final_out)
    potential_errors = sc.check_document(final_text)
    spell_report = REPORTS_DIR / f"{input_md.stem}_spell_{ts}.txt"
    total_words = len(sc.extract_words(final_text))
    header = [
        f"Spell Check Report - {ts}",
        f"Input: {final_out.name}",
        f"Total words: {total_words}",
        f"Potential errors: {len(potential_errors)}",
        "",
        "Top items:"
    ]
    body = []
    for word, count in potential_errors[:100]:
        body.append(f"{word}: {count}")
    write_text(spell_report, '\n'.join(header + body))
    summary['steps'].append({'step': 'spell_check', 'report': str(spell_report), 'potential_errors': len(potential_errors)})

    # 7) QC: Long line detector report (no fixes)
    lld = LongLineDetector(threshold=150, min_sentence_length=40)
    lld.analyze_file(str(final_out), ignore_headers=True, ignore_code=True)
    longlines_report = REPORTS_DIR / f"{input_md.stem}_longlines_{ts}.txt"
    write_text(longlines_report, lld.generate_report())
    summary['steps'].append({'step': 'long_line_detector', 'report': str(longlines_report)})

    # 8) QC: Paragraph break detector report
    pbd = ParagraphBreakDetector()
    issues = pbd.analyze_file(str(final_out)) or []
    pbreak_report = REPORTS_DIR / f"{input_md.stem}_pbreaks_{ts}.txt"
    write_text(pbreak_report, '\n'.join(issues) if issues else 'No issues detected')
    summary['steps'].append({'step': 'paragraph_break_detector', 'report': str(pbreak_report), 'issues': len(issues)})

    # Summary file
    summary_path = REPORTS_DIR / f"{input_md.stem}_pipeline_summary_{ts}.json"
    import json
    write_text(summary_path, json.dumps(summary, indent=2))

    return summary


def main():
    ap = argparse.ArgumentParser(description='Run integrated Markdown cleanup pipeline')
    ap.add_argument('input_md', help='Input Markdown file')
    ap.add_argument('--out-suffix', default='_pipeline', help='Suffix for final output filename (default: _pipeline). A -vN will be appended automatically.')
    args = ap.parse_args()

    input_md = Path(args.input_md).resolve()
    summary = pipeline(input_md, args.out_suffix)

    print('\n=== Pipeline complete ===')
    print(f"Input:  {summary['input']}")
    print(f"Output: {summary['final_output']}")
    for step in summary['steps']:
        print(f"- {step['step']}")


if __name__ == '__main__':
    sys.exit(main())
