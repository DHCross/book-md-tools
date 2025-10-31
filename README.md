# book-md-tools

Helps convert and prepare books for layout. Deterministic tools and pipeline for converting OCR'd PDFs and legacy source into clean Markdown suitable for Word/InDesign workflows.

## ⚠️ Recent Changes (v2.0)

### Script Consolidation
We've consolidated several single-purpose scripts into a more powerful and maintainable `fix_formatting.py` tool. The following scripts are now deprecated:

| Deprecated Script | New Equivalent |
|-------------------|----------------|
| `normalize_markdown_paragraphs.py` | `fix_formatting.py --normalize-paragraphs` |
| `fix_paragraph_spacing.py` | `fix_formatting.py` (included by default) |
| `normalize_whitespace.py` | `fix_formatting.py` (included by default) |
| `fix_missing_spaces.py` | `fix_formatting.py` (included by default) |
| `update_chapter_headers.py` | `fix_formatting.py` (handled automatically) |

### Key Benefits
- **Unified Interface**: Single entry point for all formatting fixes
- **Better Performance**: Shared regex compilation and optimized processing
- **Consistent Behavior**: Common configuration and behavior across all fixes
- **Enhanced Features**: New capabilities like smart paragraph splitting and ghost blank line removal

## Features
- **Unified Formatting Tool** (`fix_formatting.py`): All-in-one Markdown formatter
- **Orchestrated Pipeline** (`book-pipeline`): End-to-end processing with reports
- **Header Management**: Depth correction with hierarchy validation
- **Content Processing**: Paragraph, table, and list fixers
- **OCR Correction**: Base + targeted + config-driven overrides
- **Quality Control**: Spell check, long-line detection, and paragraph-break analysis
- **VS Code Integration**: Tasks for one-click runs

## Install (editable)
```sh
pip install -e .
```

## Main Tools

### Formatting & Normalization
```bash
# Basic usage
python scripts/fix_formatting.py input.md -o output.md

# Process directory of files
python scripts/fix_formatting.py "chapters/*.md" -o formatted/

# In-place editing with backup
python scripts/fix_formatting.py -i -b book.md

# Control paragraph length
python scripts/fix_formatting.py --max-paragraph-length 600 input.md

# Disable specific features
python scripts/fix_formatting.py --no-normalize-paragraphs --no-fix-ghost-blanks input.md
```

### Other Tools
```bash
# Run the full processing pipeline
book-pipeline <input.md> [--out-suffix _pipeline_v1]

# Individual processing steps
fix-headers <file.md> --max-depth 4
fix-ocr <file.md>
fix-ocr-extra <file.md>
fix-tables <file.md>
spell-check <file.md>
long-lines <file.md> [--threshold 150]
pbreaks <file.md>
remove-daggers <in.md> [out.md]
```

### Deprecated Scripts
Deprecated scripts will continue to work but will show a warning. Please update your workflows to use the new `fix_formatting.py` tool.

## Repo hygiene
- Keep large PDFs and full books out of public repos; include samples/snippets only.
- Use `reports/` for generated QC artifacts (gitignored if public).

## License
MIT (change as needed).
