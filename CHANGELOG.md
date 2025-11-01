# Changelog

All notable changes to book-md-tools are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-08-07

### Major Changes

#### Script Consolidation
Consolidated five single-purpose scripts into a unified `fix_formatting.py` tool for improved maintainability and performance.

**Deprecated Scripts** (still functional, but no longer recommended):
- `normalize_markdown_paragraphs.py` → use `fix_formatting.py --normalize-paragraphs`
- `fix_paragraph_spacing.py` → use `fix_formatting.py`
- `normalize_whitespace.py` → use `fix_formatting.py`
- `fix_missing_spaces.py` → use `fix_formatting.py`
- `update_chapter_headers.py` → use `fix_formatting.py`

### Added

#### New Tools
- **`fix_formatting.py`** - Unified Markdown formatting tool
  - All-in-one solution for paragraph normalization, spacing fixes, whitespace cleanup
  - Shared regex compilation and optimized processing
  - New smart paragraph splitting capabilities
  - Ghost blank line removal
  - Supports directory processing with pattern matching
  - In-place editing with automatic backups
  - Configurable paragraph length limits

#### Enhanced Detection
- **`paragraph_break_detector.py`** enhancement
  - Increased detection from ~47 to 500+ potential issues
  - New: Cross-blockquote sentence break detection
  - New: Incomplete action verb analysis
  - New: Relative clause break detection
  - New: Orphaned word detection
  - Comprehensive categorization and reporting
  - Contextual analysis with line numbers
  - Production-ready error handling

- **`image_reference_remover.py`** (new)
  - Removes all Markdown image references `![alt](path)`
  - Removes HTML image tags `<img>`
  - Multiple pattern detection for various formats
  - Preview mode for safe testing
  - Detailed removal reporting
  - Integrated into standard post-Pandoc cleanup workflow

#### Header Management
- **`markdown_header_depth_corrector.py`** (v1.1.0)
  - Automatic versioning system (`_v1`, `_v2`, etc.)
  - Converts H5+ headers to bold text
  - Automatic hierarchy validation and fixing
  - Comprehensive transformation reporting
  - Configurable max depth (default H4)

#### Quality Control Tools
- **`long_line_detector.py`**
  - Detects lines exceeding configurable thresholds (default: 150 chars)
  - Smart breaking at natural sentence boundaries
  - Preserves Markdown formatting (blockquotes, headers, code, tables)
  - Severity classification (minor, moderate, severe)
  - Dry-run mode with safe preview
  - Detailed reporting with line numbers and suggestions
  - Automatic fixing with backup/rollback capabilities

- **`advanced_break_fixer.py`** (v2.3+)
  - Hyphenated word split detection and fixing
  - Mid-word break detection
  - Sentence blank line split detection
  - Batch fixing with comprehensive reporting

### Changed

#### Workflow Improvements
- Recommended cleanup sequence now includes:
  1. Image removal
  2. Blockquote removal
  3. Advanced break fixing
  4. Header hierarchy fixing
  5. Long line detection and fixing
  6. Final cleanup

- Pipeline integration with detailed reporting
- VS Code task integration for common operations

#### Documentation
- Enhanced `README.md` with v2.0 deprecation notices
- Comprehensive `TLG_Python_Tools_Documentation.md` with full tool inventory
- Added workflow examples and real-world impact metrics

### Performance

#### Real-World Test Results (Yggsburgh & Essential Places TRPG Test Cases)
- **Header Depth Correction**:
  - 894 headers analyzed
  - 643 headers corrected (H5-H8 → bold)
  - 38 automatic hierarchy fixes
  - Processing time: < 5 seconds

- **Long Line Detection**:
  - 2,536 long line issues detected
  - 1,439 severe (>300 chars)
  - 544 moderate (225-300 chars)
  - 553 minor (150-225 chars)
  - Would create ~7,500 new paragraph breaks

- **Paragraph Break Detection**:
  - 545 potential artifacts found
  - Cross-blockquote breaks previously missed
  - 500%+ improvement over basic detection

- **Break Fixing**:
  - 550+ mid-word breaks fixed
  - 306 blank line splits fixed
  - 77 continuation issues fixed

- **Overall Time Savings**:
  - Manual review: 4-6 hours → 30 minutes with tools
  - 90%+ reduction in human error
  - Enhanced accuracy vs. manual detection
  - Universal application to any TRPG or markdown-formatted book

### Maintenance

#### File Organization
- Tools stored in `/tools/` directory
- Scripts in `/scripts/` directory
- Reports generated to `/reports/` (gitignored if public)
- Sample data in `/scripts/test_data/`

#### Dependencies
- Python 3.9+ required
- No external dependencies (built-in libraries only)
- Cross-platform compatible (Windows, macOS, Linux)

### Technical Details

#### Code Quality
- Deterministic and idempotent operations
- Comprehensive error handling
- Robust validation and sanity checks
- Production-ready code

#### Configuration
- Config-driven overrides in `configs/` (e.g., `ocr_overrides.json`)
- Extensible design for future enhancements
- CLI-first interfaces for scriptability

### Deprecation Notices

The following scripts will continue to function but are no longer recommended:

| Script | Status | Alternative |
|--------|--------|-------------|
| `normalize_markdown_paragraphs.py` | ⚠️ Deprecated | `fix_formatting.py --normalize-paragraphs` |
| `fix_paragraph_spacing.py` | ⚠️ Deprecated | `fix_formatting.py` |
| `normalize_whitespace.py` | ⚠️ Deprecated | `fix_formatting.py` |
| `fix_missing_spaces.py` | ⚠️ Deprecated | `fix_formatting.py` |
| `update_chapter_headers.py` | ⚠️ Deprecated | `fix_formatting.py` |

**Migration Timeline**: Deprecated scripts will show warnings. Please update workflows to use `fix_formatting.py`.

### Known Issues
- None reported

### Security
- No security issues or changes

---

## [1.9.0] - 2025-08-07

### Added
- `long_line_detector.py` - Detect and fix overly long paragraphs
- Enhanced header fixing with footer/artifact removal

### Changed
- Improved paragraph break detection patterns
- Better handling of blockquote boundaries

---

## [1.8.0] - 2025-08-01

### Added
- `markdown_header_fixer.py` - Automatic header hierarchy fixing
- Footer and header artifact detection
- Automatic backup creation before modifications

### Changed
- Enhanced blockquote handling
- Improved anchor tag detection

---

## [1.7.0] - 2025-07-25

### Added
- `paragraph_break_detector.py` enhancement - Mid-word break detection
- Cross-blockquote sentence break analysis
- Verb-object phrase recognition
- Comprehensive pattern matching for various break types

### Changed
- Expanded detection patterns from 20+ to 50+
- Improved context reporting with surrounding text

---

## [1.6.0] - 2025-07-20

### Added
- `paragraph_break_detector.py` - Initial paragraph break detection
- `book_parser.py` - Table formatting for VS Code integration
- Basic detection patterns for conversion artifacts
- Initial TLG publishing pipeline

### Changed
- Workflow documentation improvements
- Added usage examples

---

## Future Enhancements (Planned)

### Tool Ideas
- `anchor_remover.py` - Automated Pandoc anchor tag removal
- `table_formatter.py` - Specialized table of contents formatting
- `markdown_validator.py` - Final validation of Markdown output
- `indesign_prep.py` - Final preparation for InDesign import
- `batch_processor.py` - Process multiple documents through full pipeline

### Potential Features
- Machine learning false positive filtering
- YAML/JSON configuration files for custom patterns
- HTML/PDF report generation with before/after comparisons
- Automated integration testing for tool outputs
- Pattern learning from manual corrections
- Cross-reference validation

---

## Repository Guidelines

### Hygiene
- Keep large PDFs and full books out of public repos
- Include samples/snippets only
- Use `reports/` directory for generated QC artifacts (gitignored if public)

### Contributing
- Use Python 3.9+
- Keep fixers deterministic and idempotent
- Prefer config-driven overrides in `configs/`
- Add unit tests where possible
- Update `README.md` when adding new CLI tools or VS Code tasks

### License
MIT (change as needed)

---

## Version Tags

- Latest: `v2.0.0` (2025-08-07)
- Previous: `v1.9.0` (2025-08-07)
- See git tags for complete history
