# Table Tools Module – Electron App Integration

**Version:** 2.2.0  
**Date:** November 2, 2025

## Overview

The **Table Tools Module** is a unified interface in the Book MD Workbench Electron app that consolidates three powerful table conversion utilities into a single, cohesive workflow. This module enables seamless conversion between various table formats commonly used in TTRPG publishing workflows.

## Module Components

The Table Tools module integrates three specialized converters:

### 1. **Markdown Table to TSV**
- **Purpose:** Extract markdown pipe tables and convert to tab-delimited format
- **Primary Use Case:** InDesign import workflow for Nation Builder tables
- **Input:** Markdown files with pipe tables (`| Header | Header |`)
- **Output:** Tab-delimited text files with optional header comments

### 2. **Names to Columns**
- **Purpose:** Convert comma-separated name lists to multi-column format
- **Primary Use Case:** Book of Names multi-column layout preparation
- **Input:** Text files with comma-separated lists or dice tables
- **Output:** Tab-delimited columns (2-10 columns configurable)

### 3. **Multi-Format Converter**
- **Purpose:** Convert messy TTRPG multiplier tables to structured formats
- **Primary Use Case:** Converting complex game tables from PDFs/OCR
- **Input:** Unstructured text with categories, descriptors, and values
- **Output:** TSV, CSV, or Markdown tables with semantic parsing

## Accessing the Module

### Sidebar Button
1. Click **📊 Table Converters** in the sidebar
2. The app switches to the **Table Tools** tab
3. Select your desired conversion tool from the three options

### Direct Tab Navigation
- Navigate to the **Table Tools** tab in the main tab bar

## Tool 1: Markdown Table to TSV

### Features
- **Automatic Table Detection:** Finds all pipe tables in markdown files
- **Header Preservation:** Preserves preceding headers as comments (e.g., `# Part 1`)
- **Real Tab Characters:** Outputs actual `\t` characters for InDesign compatibility
- **Multi-Table Support:** Processes multiple tables in a single file

### Workflow

1. **Select Input File**
   - Click "Browse..." next to Input File
   - Select your markdown file containing pipe tables
   - Output path auto-generates with `.txt` extension

2. **Configure Options**
   - ☑️ **Skip header comments:** Omit `# Header` lines from output
   - Leave unchecked to preserve table context

3. **Convert**
   - Click "Convert to TSV"
   - Progress indicator shows conversion status
   - Result displays in the panel below

4. **Export Results**
   - File automatically saved to output path
   - Click "Copy to Clipboard" to paste into InDesign
   - Preview shows exact tab-delimited format

### Example Input
```markdown
## Part 1 – European Titles

| English | French | German |
| :--- | :--- | :--- |
| Emperor | Empereur | Kaiser |
| King | Roi | König |
```

### Example Output
```
# Part 1 – European Titles

English	French	German
Emperor	Empereur	Kaiser
King	Roi	König
```

## Tool 2: Names to Columns

### Features
- **Comma List Parsing:** Converts `Name1, Name2, Name3` to columns
- **Dice Table Support:** Handles `1 Name1, 2 Name2` format
- **Configurable Columns:** 2-10 columns with auto-wrapping
- **Section Preservation:** Maintains headers and dividers

### Workflow

1. **Select Input File**
   - Click "Browse..." next to Input File
   - Select text file with comma-separated names
   - Output path auto-generates with `-Columns.txt` suffix

2. **Set Column Count**
   - Adjust "Columns" spinner (default: 4)
   - Range: 2-10 columns

3. **Convert**
   - Click "Convert to Columns"
   - Names wrap to next row after reaching column limit
   - Result displays in panel

4. **Export Results**
   - File saved to output path
   - Copy to clipboard for multi-column layout

### Example Input
```
### Male Names (d%)

Aethelred, Alaric, Aldous, Alfred, Ambrose, Archibald, Baldwin, Barnaby
```

### Example Output
```
### Male Names (d%)

Aethelred	Alaric	Aldous	Alfred
Ambrose	Archibald	Baldwin	Barnaby
```

## Tool 3: Multi-Format Converter

### Features
- **Semantic Parsing:** Intelligently pairs descriptors with multipliers
- **Orphan Detection:** Identifies unpaired lines for manual review
- **Multiple Output Formats:**
  - TSV (Tab-Delimited)
  - CSV (Comma-Delimited)
  - Markdown (formatted tables)
- **In-Memory Processing:** No file I/O required, paste and convert

### Workflow

1. **Paste Input Text**
   - Paste messy table text into textarea
   - Example format:
     ```
     Population Density
     Multiplier
     Empty 0 to 10%
     x0.5
     Sparse 10 to 25%
     x0.75
     ```

2. **Select Output Format**
   - Choose from dropdown:
     - **TSV** – Tab-delimited (InDesign)
     - **CSV** – Comma-delimited (Excel)
     - **Markdown** – Pretty tables for documentation

3. **Convert**
   - Click "Convert"
   - Semantic parser pairs descriptors with values
   - Orphaned lines shown in warning box

4. **Export Results**
   - Copy to clipboard directly
   - Click "Clear" to reset for next conversion

### Example Input (Messy)
```
Population Density
Multiplier
Empty 0 to 10%
x0.5
Sparse 10 to 25%
x0.75
```

### Example Output (TSV)
```
Category	Section	Descriptor	Multiplier
Population Density	Multiplier	Empty 0 to 10%	x0.5
Population Density	Multiplier	Sparse 10 to 25%	x0.75
```

### Example Output (Markdown)
```markdown
# Population Density

### Multiplier

| Descriptor | Multiplier |
| :--- | :--- |
| Empty 0 to 10% | x0.5 |
| Sparse 10 to 25% | x0.75 |
```

## Technical Details

### IPC Handlers (main.js)

#### `convert-md-table-to-tsv`
```javascript
window.electronAPI.convertMdTableToTsv(inputPath, options)
```
- **Parameters:**
  - `inputPath` (string): Absolute path to markdown file
  - `options` (object):
    - `outputPath` (string): Output file path
    - `noHeaders` (boolean): Skip header comments
- **Returns:** `{ success, message, output, content, outputPath }`

#### `convert-names-to-columns`
```javascript
window.electronAPI.convertNamesToColumns(inputPath, options)
```
- **Parameters:**
  - `inputPath` (string): Absolute path to text file
  - `options` (object):
    - `outputPath` (string): Output file path
    - `columns` (number): Number of columns (2-10)
- **Returns:** `{ success, message, output, content, outputPath }`

#### `convert-table-multi-format`
```javascript
window.electronAPI.convertTableMultiFormat(inputText, format)
```
- **Parameters:**
  - `inputText` (string): Raw table text
  - `format` (string): 'tsv', 'csv', or 'markdown'
- **Returns:** `{ success, message, output, orphans }`

### Python Scripts

The module leverages existing Python tools:

1. **tools/md_table_to_tsv.py** (230 lines)
   - Regex-based pipe table extraction
   - Header comment generation
   - Real tab character output

2. **tools/convert_names_to_columns.py** (existing)
   - Comma list parser
   - Dice table formatter
   - Configurable column wrapping

3. **JavaScript Implementation** (main.js)
   - Multi-format converter logic ported from HTML tool
   - Semantic parsing for descriptor/value pairing
   - Orphan detection algorithm

## Keyboard Shortcuts

| Action | Shortcut |
| :--- | :--- |
| Open Table Tools Tab | Click sidebar button |
| Switch Between Tools | Click tool selector buttons |
| Clear Input (Multi-Format) | Click "Clear" button |

## File Format Support

### Input Formats
- **Markdown:** `.md`, `.markdown` (pipe tables)
- **Text:** `.txt` (comma lists, dice tables, messy tables)
- **Raw Text:** Direct paste for multi-format converter

### Output Formats
- **TSV:** Tab-delimited (`.txt`, real `\t` characters)
- **CSV:** Comma-delimited (quoted fields)
- **Markdown:** Pipe tables with headers
- **Multi-Column Text:** Tab-delimited columns

## Common Workflows

### Workflow A: Nation Builder to InDesign
1. Open Table Tools tab
2. Select "Markdown → TSV" tool
3. Load markdown file with tables
4. Convert to TSV
5. Copy to clipboard
6. Import into InDesign via "Place" (⌘D)
7. InDesign recognizes tabs as column delimiters

### Workflow B: Book of Names Multi-Column Layout
1. Open Table Tools tab
2. Select "Names → Columns" tool
3. Load comma-separated name list
4. Set columns to 4 (standard layout)
5. Convert
6. Import into InDesign for multi-column text frame

### Workflow C: OCR Table Cleanup
1. Open Table Tools tab
2. Select "Multi-Format Converter" tool
3. Paste messy OCR output from PDF
4. Select TSV output format
5. Convert and review orphans
6. Fix any unpaired lines manually
7. Copy result to clipboard
8. Import into spreadsheet or InDesign

## Best Practices

### Markdown Table to TSV
- ✅ Use consistent pipe alignment for readability
- ✅ Include descriptive headers before tables (preserved in output)
- ✅ Keep header comments enabled unless InDesign template requires clean data
- ❌ Don't mix pipe tables with HTML tables in same file

### Names to Columns
- ✅ Use 4 columns for standard Book of Names layout
- ✅ Keep comma lists on single lines (no line breaks mid-list)
- ✅ Use consistent spacing after commas
- ❌ Don't exceed 10 columns (readability limit)

### Multi-Format Converter
- ✅ Review orphan warnings before finalizing
- ✅ Use TSV for InDesign, CSV for Excel, Markdown for docs
- ✅ Clean input text first (remove extra whitespace, underscores)
- ❌ Don't ignore orphans – may indicate parsing issues

## Troubleshooting

### Issue: No tables detected
- **Cause:** Input file doesn't contain markdown pipe tables
- **Solution:** Verify table format uses `|` delimiters with separator row (`| :--- |`)

### Issue: Orphaned lines in multi-format
- **Cause:** Parser couldn't pair descriptor with value
- **Solution:** Review orphans list, manually add missing values, reconvert

### Issue: Columns misaligned in InDesign
- **Cause:** Output contains spaces instead of real tabs
- **Solution:** Verify conversion used md_table_to_tsv.py (not markdown export)

### Issue: Too many/few columns
- **Cause:** Column count setting incorrect for names converter
- **Solution:** Adjust "Columns" spinner before converting

### Issue: Special characters corrupted
- **Cause:** Encoding mismatch
- **Solution:** Ensure input files are UTF-8 encoded

## Version History

### 2.2.0 (November 2, 2025)
- ✨ **NEW:** Unified Table Tools module in Electron app
- ✨ Integrated three specialized converters into single interface
- ✨ Added in-memory multi-format converter (no file I/O)
- ✨ Added clipboard copy functionality for all tools
- ✨ Added real-time result preview for all conversions
- 🎨 Redesigned UI with tool selector and tabbed panels
- 📚 Created comprehensive module documentation

### 2.1.0 (November 2, 2025)
- Initial integration of individual tools (separate workflows)

## Related Documentation

- [Markdown Table to TSV Guide](./MD_TABLE_TO_TSV.md)
- [Document Comparator Guide](./DOCUMENT_COMPARATOR.md)
- [Electron App Integration](./DOCUMENT_COMPARATOR_ELECTRON_INTEGRATION.md)
- [Convert to Tab Delimited (HTML Tool)](../Convert_to_tab_delminated.html)

## Support

For issues or feature requests:
1. Check this documentation for common solutions
2. Review Python tool documentation for CLI options
3. Test with sample data to isolate the issue
4. Check console logs in Electron app (View → Toggle Developer Tools)

---

**Module maintained by:** Book MD Tools Project  
**Last updated:** November 2, 2025
