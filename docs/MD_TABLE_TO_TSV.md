# Markdown Table to Tab-Delimited (TSV) Converter

Converts markdown pipe tables to tab-delimited format for InDesign import.

## Quick Usage

```bash
# Convert and print to stdout
python3 tools/md_table_to_tsv.py input.md

# Save to file
python3 tools/md_table_to_tsv.py input.md -o output.txt

# Copy to clipboard (requires: pip install pyperclip)
python3 tools/md_table_to_tsv.py input.md --clipboard

# Convert without section headers
python3 tools/md_table_to_tsv.py input.md --no-headers -o output.txt
```

## What It Does

Takes markdown tables like this:

```markdown
### Aristocratic Titles

| English | French   | German |
| :------ | :------- | :----- |
| Emperor | Empereur | Kaiser |
| King    | Roi      | König  |
| Duke    | Duc      | Herzog |
```

And converts to tab-delimited format:

```
# Aristocratic Titles

English	French	German
Emperor	Empereur	Kaiser
King	Roi	König
Duke	Duc	Herzog
```

The tabs are **real tab characters** (`\t`), not spaces, making it perfect for:
- InDesign table import
- Excel/Spreadsheet import
- Database import
- Any system expecting TSV format

## Features

✅ Extracts all markdown pipe tables from document  
✅ Preserves section headers as comments  
✅ Handles multi-line tables  
✅ Skips separator lines (`:---`)  
✅ Maintains table structure  
✅ Real tab characters for proper TSV  
✅ Optional clipboard copy  
✅ Clean, ready-to-import output  

## Options

```
positional arguments:
  input                 Input markdown file

options:
  -h, --help            show this help message and exit
  -o OUTPUT, --output OUTPUT
                        Output file path
  --no-headers          Exclude section headers from output
  --clipboard           Copy result to clipboard (requires pyperclip)
```

## Examples

### Basic Conversion

```bash
python3 tools/md_table_to_tsv.py nation_builder.md -o tables.txt
```

### InDesign Workflow

1. Convert markdown tables to TSV:
   ```bash
   python3 tools/md_table_to_tsv.py aristocratic_titles.md -o titles.txt
   ```

2. In InDesign:
   - Create text frame
   - File → Place → `titles.txt`
   - Table → Convert Text to Table
   - Column Separator: Tab
   - Row Separator: Paragraph

3. Format table as needed

### Multiple Tables

The tool automatically detects and converts all tables in a document:

```bash
python3 tools/md_table_to_tsv.py full_document.md -o all_tables.txt
```

Output will have all tables separated by blank lines with their headers preserved.

## Section Headers

By default, the tool includes section headers as comments (lines starting with `#`):

```
# Part 1 – European Titles

English	French	German
Emperor	Empereur	Kaiser
```

To exclude headers:

```bash
python3 tools/md_table_to_tsv.py input.md --no-headers -o output.txt
```

## Clipboard Support

For quick copy-paste workflows:

```bash
# Install pyperclip (one-time)
pip install pyperclip

# Copy to clipboard
python3 tools/md_table_to_tsv.py input.md --clipboard
```

Then paste directly into InDesign, Excel, or any application.

## Use Cases

### Nation Builder Tables

Perfect for converting aristocratic titles, trade goods, resources, and other game reference tables.

### Book of Names

Can convert name lists and dice tables (though `convert_names_to_columns.py` is more specialized for that).

### General TTRPG Content

Any markdown table from character sheets, equipment lists, spell tables, monster stats, etc.

## Technical Details

- Parses markdown pipe tables (`| cell | cell |`)
- Skips alignment rows (`| :--- | :--- |`)
- Preserves empty cells (represented as `—` or blank)
- Uses actual tab character (`\t`) as delimiter
- Handles Unicode characters (em dashes, accented letters)
- Captures preceding headers (markdown `###` or bold `**text**`)

## Comparison with Other Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `md_table_to_tsv.py` | **General markdown tables → TSV** | Any markdown pipe table |
| `convert_names_to_columns.py` | **Name lists → Multi-column** | Book of Names, comma-separated lists |
| `Convert_to_tab_delminated.html` | **Web UI for multiplier tables** | Interactive browser-based conversion |

## Related Tools

- **HTML Tool**: `Convert_to_tab_delminated.html` - Web-based multi-format converter
- **Names Tool**: `tools/convert_names_to_columns.py` - Specialized for Book of Names
- **VS Code Tasks**: Pre-configured tasks available in `.vscode/tasks.json`

## Tips

💡 **Always preview output** before importing to InDesign  
💡 **Keep markdown source** as the master - TSV is for export only  
💡 **Use consistent column counts** for best results  
💡 **Test with small tables first** before bulk conversion  
💡 **Check for em dashes** (`—`) in empty cells  

## Troubleshooting

### No tables found

**Issue**: "Warning: No markdown tables found"

**Solution**: Ensure tables use pipe format:
```markdown
| Header 1 | Header 2 |
| :------- | :------- |
| Cell 1   | Cell 2   |
```

### Clipboard not working

**Issue**: "Error: pyperclip not installed"

**Solution**: Install pyperclip:
```bash
pip install pyperclip
```

### Column alignment issues

**Issue**: Columns don't line up in InDesign

**Solution**: 
- Ensure all rows have same number of cells
- Check for stray pipes (`|`) in cell content
- Verify tab character is used as separator

## Integration

### Command Line

```bash
# Direct usage
python3 tools/md_table_to_tsv.py file.md
```

### From Python

```python
from md_table_to_tsv import convert_text

markdown = """
| A | B |
|---|---|
| 1 | 2 |
"""

tsv = convert_text(markdown)
print(tsv)
```

### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "label": "Convert Markdown Tables to TSV",
  "type": "shell",
  "command": "python3",
  "args": [
    "${workspaceFolder}/tools/md_table_to_tsv.py",
    "${file}",
    "-o",
    "${fileDirname}/${fileBasenameNoExtension}.txt"
  ],
  "group": "build"
}
```

## License

Part of the book-md-tools suite.
