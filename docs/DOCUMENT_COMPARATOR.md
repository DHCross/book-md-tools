# Document Comparator

**Comparative Document Auditor** for detecting content loss, structural breaks, and sequence discontinuities between two versions of a document.

## Overview

The Document Comparator implements a four-part diagnostic triad designed to catch subtle editorial issues, content loss, and structural problems that often occur during document conversion, editing, or archival processes.

### The Four Diagnostic Checks

#### 1. **Symmetry & Sequence Check**
Scans for sequential identifiers (e.g., *Part 1/Part 2*, *Table 2A/2B*, *Chapter IV/V*). If a sequence appears to stop prematurely or skips an expected continuation, it flags the issue as a probable truncation or omission.

**Detects:**
- Missing chapters, parts, or sections
- Gaps in numbered sequences
- Incomplete table series
- Missing appendices

**Example:** If Doc1 has "Chapter I, II, III, V" the tool will flag missing "Chapter IV"

#### 2. **Structural Parity Check**
Inspects all tables and lists for structural completeness. Identifies "hanging" or incomplete columns, missing headers, or abrupt terminations mid-pattern.

**Detects:**
- Unbalanced markdown table columns
- Missing table headers or separators
- Unbalanced HTML table tags (`<table>...</table>`)
- Incomplete lists
- Unbalanced markup (bold, italic, code)

**Example:** A table with 4 columns in the header but only 3 columns in data rows

#### 3. **Content Volume Comparison**
Measures approximate content density—line count, paragraph count, word tokens—within corresponding sections. Highlights any section where one version deviates by more than ±10–15% from its counterpart without explanation.

**Detects:**
- Significant content loss or additions
- Truncated sections
- Missing paragraphs
- Substantial editorial changes

**Example:** "Geography" section has 150 lines in Doc1 but only 80 lines in Doc2 (47% reduction)

#### 4. **Cross-Reference Check**
Whenever a table is titled "Part 1" or contains multi-cultural headings, the tool looks for matching keys (e.g., "Ottoman," "Indian") elsewhere in the corpus to confirm that the continuation exists.

**Detects:**
- Missing table continuations
- Orphaned "Part X of Y" references
- Incomplete multi-section content

**Example:** Table titled "Aristocratic Titles - Part 1" with Ottoman/Indian columns, but no "Part 2" found

## Installation

The tool is part of the book-md-tools suite. Ensure you have Python 3.7+ installed.

```bash
# No additional dependencies required - uses Python standard library only
chmod +x tools/document_comparator.py
```

## Usage

### Basic Comparison

```bash
python3 tools/document_comparator.py original.md revised.md
```

This will run all four checks and display a detailed text report showing any issues found.

### Generate Markdown Report

```bash
python3 tools/document_comparator.py original.md revised.md \
  --format markdown \
  --output comparison-report.md
```

### Adjust Volume Threshold

By default, the tool flags content volume differences exceeding 15%. Adjust with `--threshold`:

```bash
# Flag 10% or greater differences
python3 tools/document_comparator.py original.md revised.md --threshold 0.10

# More permissive: flag only 25%+ differences
python3 tools/document_comparator.py original.md revised.md --threshold 0.25
```

### Quiet Mode

Suppress progress messages:

```bash
python3 tools/document_comparator.py original.md revised.md --quiet
```

## Command-Line Options

```
usage: document_comparator.py [-h] [--threshold THRESHOLD] 
                               [--format {text,markdown}]
                               [--output OUTPUT] [--quiet]
                               doc1 doc2

positional arguments:
  doc1                  Baseline document path
  doc2                  Comparison document path

optional arguments:
  -h, --help            show this help message and exit
  --threshold THRESHOLD
                        Volume difference threshold (default: 0.15 = 15%)
  --format {text,markdown}
                        Report format (default: text)
  --output OUTPUT, -o OUTPUT
                        Output file path (default: print to stdout)
  --quiet, -q           Suppress progress messages
```

## Report Structure

### Issue Severity Levels

Issues are classified by severity:

- **CRITICAL** - Major structural problems, missing continuations, >30% content loss
- **MAJOR** - Missing sequences, unbalanced tables, significant content differences (15-30%)
- **MODERATE** - Formatting inconsistencies, gaps in sequences, missing sections
- **MINOR** - Potential issues that may be intentional, unbalanced markup

### Report Sections

1. **Overview** - Document paths, total issue count
2. **Issues by Severity** - Grouped listings with details and locations
3. **Summary by Check Type** - Issue counts per diagnostic check

### Sample Report Output

```
================================================================================
DOCUMENT COMPARISON REPORT
================================================================================
Baseline Document:   original.md
Comparison Document: revised.md
Total Issues Found:  12
================================================================================

CRITICAL ISSUES (2)
--------------------------------------------------------------------------------

1. Cross-Reference
   Table 'Aristocratic Titles - Part 1' in Doc2 appears to have continuation 
   (contains ['Ottoman', 'Indian']), but 'Part 2' not found
   Location (Doc2): Line 450
   Details: {'part': 1, 'keywords': ['Ottoman', 'Indian']}

2. Structural Parity
   Unbalanced HTML table tags in Doc2: 5 opening, 4 closing
   Details: {'open': 5, 'close': 4}

MAJOR ISSUES (5)
--------------------------------------------------------------------------------

1. Symmetry & Sequence
   Chapter IV present in baseline but missing in comparison document
   Location (Doc1): Line 1250
   Location (Doc2): Not found
   Details: {'sequence': 4, 'type': 'Chapter'}

...
```

## Integration with Existing Tools

### Use in Pipelines

The comparator returns exit code 1 if any CRITICAL or MAJOR issues are found, making it suitable for CI/CD pipelines:

```bash
#!/bin/bash
# Convert and validate
pandoc source.docx -o converted.md
python3 tools/document_comparator.py reference.md converted.md

if [ $? -ne 0 ]; then
    echo "Comparison failed - critical issues found"
    exit 1
fi
```

### Use with Book Pipeline

After running the book pipeline, compare before/after:

```bash
# Run pipeline
python3 scripts/book_pipeline.py original.md --out-suffix _cleaned

# Compare results
python3 tools/document_comparator.py \
  original.md \
  original_cleaned.md \
  --output reports/pipeline-comparison.md \
  --format markdown
```

## Use Cases

### 1. Post-Conversion Validation

After converting from PDF or DOCX to Markdown:

```bash
# Convert
pandoc legacy_book.pdf -o legacy_book.md

# Compare with original scan
python3 tools/document_comparator.py \
  manual_reference.md \
  legacy_book.md \
  --output conversion-audit.md \
  --format markdown
```

### 2. Editorial Review

Compare pre/post editorial changes:

```bash
python3 tools/document_comparator.py \
  draft_v1.md \
  draft_v2_edited.md \
  --threshold 0.10
```

### 3. Archive Verification

Verify completeness of archived documents:

```bash
python3 tools/document_comparator.py \
  complete_archive.md \
  recovered_partial.md
```

### 4. Quality Control

Regular QC checks during large document projects:

```bash
# Check all chapter files
for chapter in chapters/*.md; do
    python3 tools/document_comparator.py \
      "reference/$chapter" \
      "$chapter" \
      --quiet \
      >> qc-report.txt
done
```

## What Gets Detected

### ✅ Catches

- Missing chapters, parts, sections, tables, appendices
- Gaps in sequences (1, 2, 4, 5 - missing 3)
- Incomplete table structures
- Unbalanced HTML/markdown markup
- Significant content loss (>threshold)
- Orphaned multi-part references
- Missing table continuations
- Structural inconsistencies

### ⚠️ May Flag False Positives

- Intentional editorial cuts (will show as volume differences)
- Reformatted tables (may trigger structure checks)
- Renumbered sections (will show as sequence gaps)
- Style/markup changes (may trigger balance checks)

**Tip:** Use `--threshold` to tune sensitivity and review reports manually for intentional changes.

## Advanced Features

### Pattern Detection

The tool automatically recognizes:

- Roman numerals (I, II, III, IV, V...)
- Arabic numerals (1, 2, 3...)
- Letter sequences (A, B, C...)
- Compound identifiers (Table 2A, 2B, 2C)
- Dotted sections (1.2.3, 1.2.4)

### Context-Aware Analysis

- Tables with cultural keywords (Ottoman, Indian, Chinese, etc.) trigger cross-reference validation
- "Part X of Y" syntax automatically checks for all parts
- Section-by-section comparison preserves document structure

### Flexible Reporting

- Text format for terminal viewing
- Markdown format for documentation
- Detailed location tracking (line numbers)
- Structured metadata in reports

## Troubleshooting

### Issue: Too many false positives

**Solution:** Increase threshold or review if formatting differences are intentional
```bash
python3 tools/document_comparator.py doc1.md doc2.md --threshold 0.25
```

### Issue: Missing context in reports

**Solution:** Check specific line numbers in original documents, use `--format markdown` for better readability

### Issue: Slow on large documents

**Solution:** The tool processes documents linearly; performance is O(n). For very large documents (>10MB), consider splitting into sections.

## Technical Details

- **Language:** Python 3.7+
- **Dependencies:** None (standard library only)
- **Performance:** ~1-2 seconds for typical 500KB document
- **Memory:** Loads both documents into memory
- **Regex Engine:** Python `re` module

## Contributing

Found an issue or have a suggestion? This tool is part of the book-md-tools project. See `CONTRIBUTING.md` for guidelines.

## License

Part of the book-md-tools suite. See project LICENSE.

---

## Quick Reference

```bash
# Basic comparison
python3 tools/document_comparator.py doc1.md doc2.md

# Markdown report with custom threshold
python3 tools/document_comparator.py doc1.md doc2.md \
  --format markdown \
  --output report.md \
  --threshold 0.10

# Quiet mode for scripts
python3 tools/document_comparator.py doc1.md doc2.md -q
```

**Exit Codes:**
- `0` - Success, no critical/major issues
- `1` - Critical or major issues found
