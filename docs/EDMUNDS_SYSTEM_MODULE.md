# Edmunds System Bridge Module Specification

## Overview

The **Edmunds System Bridge** is a specialized module for the book-md-tools workbench that automates the insertion and removal of numeric hierarchy tags (`<1>`, `<2>`, `<3>`) used in professional layout workflows. Named after layout artist Bill Edmunds, this system provides a deterministic bridge between editorial Markdown and layout-ready files for InDesign/Word import.

## Purpose

This module formalizes the traditional hand-tagging workflow where layout artists manually inserted numeric tags to indicate heading hierarchy. By automating this process with preview capabilities, it reduces human error while maintaining full editorial control over the final output.

## Core Functionality

### 1. Tag Injection
Automatically detects ATX-style Markdown headers and inserts numeric tags matching their depth:
- `#` → `<1>` (Chapter level)
- `##` → `<2>` (Section level)
- `###` → `<3>` (Subsection level)
- etc.

### 2. Tag Removal
Symmetrically removes all numeric tags, restoring clean Markdown for publication or further editing.

### 3. Tag Format Options
Supports multiple tag representations for compatibility with different rendering engines:
- **Backtick** (default): `` `<1>` `` - Safe for GitHub, PyPI, ReadTheDocs
- **Raw**: `<1>` - Direct format for Word/InDesign import
- **Comment**: `<!--1-->` - Invisible in most renderers
- **Bracket**: `[1]` - Alternative for systems that sanitize angle brackets

## GUI Workbench Integration

### Module Location
```
Workbench → Layout Tools → Edmunds System Bridge
```

### Interface Design

#### Main Window Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Edmunds System Bridge                               [?] [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ Operation: ○ Inject Tags    ○ Remove Tags                   │
│                                                               │
│ Tag Format: ⊙ Backtick   ○ Raw   ○ Comment   ○ Bracket      │
│                                                               │
│ Max Depth: [4 ▼]  (Optional: cap heading levels)            │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                    BEFORE PREVIEW                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ # Chapter Title                                        │   │
│ │                                                        │   │
│ │ ## Section Title                                       │   │
│ │ Some paragraph text.                                   │   │
│ │                                                        │   │
│ │ ### Subsection Title                                   │   │
│ │ More text.                                             │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
│                    AFTER PREVIEW                              │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ # `<1>` Chapter Title                                  │   │
│ │                                                        │   │
│ │ ## `<2>` Section Title                                 │   │
│ │ Some paragraph text.                                   │   │
│ │                                                        │   │
│ │ ### `<3>` Subsection Title                             │   │
│ │ More text.                                             │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ ☑ Show diff highlighting                                     │
│ ☐ Create backup before applying                              │
│                                                               │
│ Status: Ready to process 3 headings                          │
│                                                               │
│        [Load File...]  [Apply Changes]  [Export As...]       │
└─────────────────────────────────────────────────────────────┘
```

### Key Features

#### Real-Time Preview
- **Side-by-side view**: Original markdown on left, processed result on right
- **Diff highlighting**: Changed lines highlighted in yellow/green
- **Line-by-line sync**: Scroll synchronization between panes
- **Syntax highlighting**: Markdown syntax coloring in both views

#### Interactive Controls
- **Tag format selector**: Radio buttons for backtick/raw/comment/bracket
- **Max depth slider**: Optional cap on heading depth (e.g., limit to H4)
- **Operation toggle**: Switch between inject/remove modes
- **Live update**: Preview refreshes on any control change

#### Safety Features
- **Backup creation**: Optional automatic `.bak` file before applying
- **Undo/Redo**: Full undo stack for reversible operations
- **Validation checks**: Warns if tags already exist during injection
- **Round-trip test**: Built-in verify mode to test inject→strip→compare

#### Status Bar Information
- Number of headings detected
- Number of tags to be inserted/removed
- Current file encoding
- Processing status (Ready/Processing/Complete/Error)

### Menu Integration

#### File Menu
```
File
  ├─ Load Markdown... (Cmd+O)
  ├─ Reload (Cmd+R)
  ├─ Save (Cmd+S)
  ├─ Save As... (Cmd+Shift+S)
  ├─ Export Bridge File...
  └─ Recent Files ▶
```

#### Edit Menu
```
Edit
  ├─ Undo (Cmd+Z)
  ├─ Redo (Cmd+Shift+Z)
  ├─ Copy Before View (Cmd+Shift+C)
  ├─ Copy After View (Cmd+Alt+C)
  └─ Preferences...
```

#### View Menu
```
View
  ├─ ☑ Show Diff Highlighting
  ├─ ☑ Sync Scroll
  ├─ ☑ Show Line Numbers
  ├─ Font Size ▶
  │   ├─ Increase (Cmd++)
  │   ├─ Decrease (Cmd+-)
  │   └─ Reset (Cmd+0)
  └─ Split View ▶
      ├─ Horizontal
      └─ Vertical
```

#### Tools Menu
```
Tools
  ├─ Run Round-Trip Test
  ├─ Validate Markdown
  ├─ Statistics...
  └─ Batch Process...
```

### Keyboard Shortcuts

| Action | Shortcut | Description |
|--------|----------|-------------|
| Load file | `Cmd+O` | Open Markdown file |
| Apply changes | `Cmd+Return` | Apply current operation |
| Toggle operation | `Cmd+T` | Switch inject/remove |
| Cycle format | `Cmd+F` | Cycle through tag formats |
| Preview mode | `Cmd+P` | Toggle preview on/off |
| Quick export | `Cmd+E` | Export as bridge file |

## Technical Implementation

### Backend Scripts
```python
# Core processing scripts
scripts/inject_numeric_tags.py    # Tag injection
scripts/strip_numeric_tags.py     # Tag removal

# Module wrapper
scripts/edmunds_bridge.py          # GUI backend interface
```

### GUI Framework Options
- **Python + Qt (PyQt5/PySide6)**: Cross-platform, native look
- **Python + Tkinter**: Bundled with Python, lightweight
- **Electron + React**: Web tech, modern UI
- **Swift + AppKit**: macOS native (if platform-specific)

### Data Flow
```
User Input → GUI Controls → Backend Script → Processing → Preview Update
                                                              ↓
                                                        User Review
                                                              ↓
                                                        Apply to File
```

### Module API

```python
class EdmundsBridge:
    """Main interface for Edmunds System operations."""
    
    def __init__(self, markdown_text: str):
        """Initialize with markdown content."""
        self.original = markdown_text
        self.processed = None
        
    def inject_tags(self, form: str = 'backtick', 
                    max_level: int | None = None) -> str:
        """Insert numeric tags into headers."""
        
    def strip_tags(self) -> str:
        """Remove all numeric tags."""
        
    def get_diff(self) -> list[tuple[int, str, str]]:
        """Return line-by-line differences."""
        
    def validate(self) -> dict:
        """Return validation results and statistics."""
        
    def round_trip_test(self) -> bool:
        """Test inject→strip→compare for determinism."""
```

### Statistics Display

When processing a file, show:
- Total headers detected: `12`
- By level: `H1: 1, H2: 4, H3: 7`
- Tags inserted: `12`
- Lines modified: `12`
- Fenced code blocks skipped: `2`
- Processing time: `0.03s`

## Workflow Examples

### Example 1: Prepare for Layout
1. Load manuscript: `Nation_Builder.md`
2. Select operation: **Inject Tags**
3. Choose format: **Raw** (for Word import)
4. Set max depth: **4** (cap at H4)
5. Review preview showing tags after each heading
6. Click **Apply Changes**
7. Export as: `Nation_Builder_bridge.txt`
8. Send to layout artist

### Example 2: Restore After Layout
1. Load bridge file: `Nation_Builder_bridge.txt`
2. Select operation: **Remove Tags**
3. Review preview showing clean headers
4. Click **Apply Changes**
5. Save as: `Nation_Builder_final.md`

### Example 3: Round-Trip Verification
1. Load clean markdown: `test_chapter.md`
2. Run **Tools → Round-Trip Test**
3. Module automatically:
   - Injects tags
   - Strips tags
   - Compares with original
4. Display result: `✓ Round-trip successful` or `✗ Differences detected`

## Configuration Options

### Preferences Dialog
```
┌─────────────────────────────────────────┐
│ Edmunds Bridge Preferences       [X]    │
├─────────────────────────────────────────┤
│                                          │
│ Default Settings                         │
│   Tag Format: [Backtick ▼]              │
│   Max Depth:  [4 ▼]                     │
│                                          │
│ Backup Options                           │
│   ☑ Always create backup                │
│   ☑ Keep backup timestamp                │
│   Backup suffix: [.bak]                  │
│                                          │
│ Preview Options                          │
│   ☑ Syntax highlighting                  │
│   ☑ Show line numbers                    │
│   ☑ Auto-sync scroll                     │
│   Font: [Monaco ▼] Size: [12 ▼]         │
│                                          │
│        [Restore Defaults]  [OK] [Cancel] │
└─────────────────────────────────────────┘
```

## Batch Processing Mode

For processing multiple files:

```
┌──────────────────────────────────────────────┐
│ Batch Process Edmunds Bridge          [X]    │
├──────────────────────────────────────────────┤
│                                               │
│ Files to Process:                            │
│ ┌────────────────────────────────────────┐   │
│ │ ☑ Chapter_01.md                        │   │
│ │ ☑ Chapter_02.md                        │   │
│ │ ☑ Chapter_03.md                        │   │
│ │ ☑ Chapter_04.md                        │   │
│ │ ☐ Appendix_A.md                        │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ Operation: [Inject Tags ▼]                   │
│ Format:    [Backtick ▼]                      │
│ Output:    ○ Overwrite  ⊙ New suffix [_bridge]│
│                                               │
│ Progress: ████████░░ 80% (4/5 files)         │
│                                               │
│        [Add Files...]  [Start]  [Cancel]     │
└──────────────────────────────────────────────┘
```

## Error Handling

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Tags already present | File already processed | Switch to "Remove Tags" or use force flag |
| Malformed headers | Non-ATX syntax or spacing issues | Show warning, offer to skip or fix |
| Unicode errors | Non-UTF-8 encoding | Detect encoding, offer to convert |
| Large file slow | Processing >10MB files | Show progress bar, offer chunked processing |

### Error Messages

**Warning Dialog Example:**
```
┌────────────────────────────────────┐
│ ⚠ Tags Already Present      [X]   │
├────────────────────────────────────┤
│                                    │
│ This file appears to already have │
│ numeric tags inserted.             │
│                                    │
│ Found: 12 existing tags            │
│                                    │
│ Options:                           │
│ ⊙ Remove existing tags first      │
│ ○ Skip already-tagged headers     │
│ ○ Normalize to current format     │
│ ○ Cancel operation                │
│                                    │
│          [Continue]  [Cancel]      │
└────────────────────────────────────┘
```

## Testing & Validation

### Unit Tests Required
- Header detection accuracy
- Tag insertion at correct positions
- Tag removal completeness
- Round-trip determinism
- Fenced code block skipping
- Multiple tag format handling
- Edge cases (empty headers, special chars)

### Integration Tests
- GUI preview accuracy
- File I/O operations
- Batch processing
- Undo/redo stack
- Preference persistence

### User Acceptance Tests
- Process real manuscript (Nation Builder)
- Verify IA Writer compatibility
- Test InDesign import workflow
- Confirm Bill Edmunds approval

## Documentation

### User Guide Sections
1. **Introduction**: What is the Edmunds System?
2. **Getting Started**: Load your first file
3. **Tag Injection**: Preparing for layout
4. **Tag Removal**: Restoring clean markdown
5. **Format Options**: When to use each format
6. **Batch Processing**: Handle multiple files
7. **Troubleshooting**: Common issues
8. **Advanced Tips**: Round-trip testing, custom workflows

### Video Tutorials
- "Quick Start: 3 Minutes to Your First Bridge File"
- "Understanding Tag Formats"
- "Batch Processing Multiple Chapters"
- "Round-Trip Testing for Confidence"

## Future Enhancements

### Phase 2 Features
- **Custom tag patterns**: Allow `[H1]`, `{1}`, etc.
- **Setext header support**: Underline-style headers
- **Smart tag inference**: Detect existing hierarchy conventions
- **Layout preview**: Mock-up InDesign-style rendering
- **Export presets**: Save common format combinations

### Phase 3 Features
- **Collaborative mode**: Multi-user tag review
- **Version control integration**: Git commit hooks
- **Template system**: Save/load processing recipes
- **API access**: Scriptable via command line or REST
- **Cloud sync**: Share bridge files with team

## Integration with Existing Tools

### Compatibility
- Works alongside all existing book-md-tools scripts
- Does not modify body paragraphs or other formatting
- Safe to use on files already processed by other tools
- Can be inserted into existing pipelines

### Pipeline Position
```
Markdown Creation
    ↓
Other Cleanup Tools (fix_formatting.py, etc.)
    ↓
Edmunds Bridge (inject tags)  ← NEW MODULE
    ↓
Export to Word/InDesign
    ↓
Layout Work
    ↓
Edmunds Bridge (strip tags)   ← NEW MODULE
    ↓
Final Markdown/Publication
```

## Success Criteria

The module will be considered successful when:
- ✅ Round-trip testing shows 100% accuracy
- ✅ Processing time < 1 second for typical manuscripts
- ✅ No manual tag editing required
- ✅ Layout artists report faster import workflow
- ✅ Zero data loss in conversion cycle
- ✅ Positive feedback from editorial team

## Maintenance & Support

### Version Control
- Tag releases with semantic versioning
- Maintain changelog
- Document breaking changes
- Provide migration guides

### Community
- GitHub issues for bug reports
- Discussion forum for workflow tips
- Example files and templates
- Video tutorial library

---

**Document Version**: 1.0  
**Created**: 2025-11-01  
**Author**: GitHub Copilot for book-md-tools  
**Status**: Specification - Ready for Implementation  
**Next Step**: Begin GUI prototyping with PyQt5
