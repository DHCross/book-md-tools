````markdown
# book-md-tools

Universal TRPG and Markdown book formatting suite. Convert and prepare any tabletop RPG book (or markdown-formatted book) for professional layout. Deterministic tools and pipeline for converting OCR'd PDFs and legacy source formats into clean, production-ready Markdown suitable for Word/InDesign workflows.

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

## Universal TRPG & Markdown Book Support

This suite is designed to work with any TRPG book or markdown-formatted publication, including:
- D&D 5e supplements
- Pathfinder books
- Custom TRPG rulesets
- World-building guides
- Campaign modules
- Any markdown-formatted book

Yggsburgh and Essential Places were proof-of-concept test cases demonstrating the tools' effectiveness. The suite is ready for production use with any similar publication.

## Post-conversion numeric tagging for layout handoff (`<1>`, `<2>`, `<3>`)

**The Edmunds System Bridge** — named after layout artist Bill Edmunds — automates the insertion and removal of numeric hierarchy tags for professional layout workflows.

These tags are a post-processing aid for layout (e.g., InDesign). They do not replace Markdown headers. The following sequence describes how numeric tags are introduced after export to preserve heading order through layout import.

When: after conversion to Word (`.docx`) or to plain `.txt` (bridge file).

### Safe Interchange and Clean Files

At its heart, the Edmunds System is a minimalist handshake between editorial precision and design automation:

> **"Structure survives. Style can be rebuilt."**

The system's philosophy rests on three principles:

1. **Tags for Hierarchy** — Numeric markers preserve semantic meaning through lossy conversions
2. **Safe Interchange** — Multiple tag formats survive any renderer or export stage
3. **Clean Files** — Reversible operations ensure manuscripts remain canonical

**📖 Documentation:**
- Core protocol: [`docs/EDMUNDS_SYSTEM_CORE_PROTOCOL.md`](docs/EDMUNDS_SYSTEM_CORE_PROTOCOL.md) — The three operations and three guarantees
- Quick reference: [`docs/EDMUNDS_SYSTEM_QUICK_REFERENCE.md`](docs/EDMUNDS_SYSTEM_QUICK_REFERENCE.md) — Command-line examples
- GUI specification: [`docs/EDMUNDS_SYSTEM_MODULE.md`](docs/EDMUNDS_SYSTEM_MODULE.md) — Future workbench module design

Workflow:
1) Draft in Markdown/plain text with normal headers (`#`, `##`, `###`).
2) Convert to Word (`.docx`) for editorial review (Markdown structure may flatten).
3) Tagging pass in Word or plain text: insert `<1>`, `<2>`, `<3>` at the start of heading lines to encode hierarchy.
4) Layout Mapping: map tags to paragraph styles, then remove tags.

Plain-text example (bridge file, before layout):
```
<1> CHAPTER 3: GOVERNMENT AND RULERSHIP

<2> Feudal Structures
The feudal order represents the dominant social model in many realms...

<3> The Manor Lord
Each manor is presided over by a landed knight or noble whose obligations...

<3> Duties and Oaths
Vassals are bound by oaths of service to their liege lord...

<2> Monarchies
Monarchies come in many forms, from elective kingships to absolute dynasties...
```

InDesign import mapping:
- Find `<1>` → apply `H1_Main` → remove tag
- Find `<2>` → apply `H2_Section` → remove tag
- Find `<3>` → apply `H3_Subsection` → remove tag

Notes:
- Tags are literal text; headings are otherwise unstyled at this stage. Lines above/below headings are blank; body paragraphs are clean text (inline italics are fine).
- Some Markdown renderers treat bare `<1>` like HTML. In prose, show tags as `` `<1>` ``, `` `<2>` ``, `` `<3>` `` to avoid parsing issues. The files themselves should contain the literal forms for search/replacement.
- Automation (optional): use `scripts/inject_numeric_tags.py` to create a tagged bridge from Markdown (default backticked tags for renderer safety), and `scripts/strip_numeric_tags.py` to remove tags if needed. These scripts are idempotent; you can safely rerun them without duplicating or corrupting tags.

> Documentation and production workflow derived from Gygax Archive editorial standards (Troll Lord Games, 2025).

## Repo hygiene
- Keep large PDFs and full books out of public repos; include samples/snippets only.
- Use `reports/` for generated QC artifacts (gitignored if public).

## License
MIT (change as needed).
