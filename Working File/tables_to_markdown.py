#!/usr/bin/env python3
"""
JSON Tables to Markdown Converter
Converts tables.json to markdown format
"""

import json
import html
import re
from pathlib import Path

def clean_html_text(text):
    """Clean HTML from text content"""
    if not text:
        return ""
    
    # Decode HTML entities
    text = html.unescape(text)
    
    # Convert HTML tags to markdown
    replacements = {
        '<strong>': '**',
        '</strong>': '**',
        '<b>': '**',
        '</b>': '**',
        '<em>': '*',
        '</em>': '*',
        '<i>': '*',
        '</i>': '*',
    }
    
    for html_tag, md_tag in replacements.items():
        text = text.replace(html_tag, md_tag)
    
    # Remove remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Clean up extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def format_table_to_markdown(table_data):
    """Convert a table from JSON format to markdown"""
    name = table_data.get('name', 'Unknown Table')
    slug = table_data.get('slug', '')
    description = table_data.get('descr', '')
    source = table_data.get('source', '')
    columns = table_data.get('columns', [])
    rows = table_data.get('rows', [])
    
    markdown_lines = []
    
    # Table header
    markdown_lines.append(f"### {name}")
    if source:
        markdown_lines.append(f"*Source: {source}*")
    if slug:
        markdown_lines.append(f"*Slug: {slug}*")
    markdown_lines.append("")
    
    # Description (clean HTML)
    if description:
        clean_desc = clean_html_text(description)
        if clean_desc and clean_desc != name:  # Avoid duplicate if description is just the name
            markdown_lines.append(clean_desc)
            markdown_lines.append("")
    
    # Table header row
    if columns:
        header_row = "| " + " | ".join([col.get('name', '') for col in columns]) + " |"
        markdown_lines.append(header_row)
        
        # Table separator row
        separator = "| " + " | ".join(["---"] * len(columns)) + " |"
        markdown_lines.append(separator)
        
        # Table data rows
        for row in rows:
            if isinstance(row, list):
                # Clean HTML from each cell
                clean_row = [clean_html_text(str(cell)) for cell in row]
                row_text = "| " + " | ".join(clean_row) + " |"
                markdown_lines.append(row_text)
    
    markdown_lines.append("")
    markdown_lines.append("---")
    markdown_lines.append("")
    
    return "\n".join(markdown_lines)

def convert_tables_to_markdown(json_file):
    """Convert all tables from JSON to markdown"""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            tables_data = json.load(f)
        
        if not tables_data:
            return "No tables found in the JSON file."
        
        markdown_content = []
        markdown_content.append("# D&D Tables Collection")
        markdown_content.append("=" * 25)
        markdown_content.append("")
        markdown_content.append("This document contains various tables from the D&D Player's Handbook converted to markdown format.")
        markdown_content.append("")
        
        # Group tables by type/category
        background_tables = []
        other_tables = []
        
        for table in tables_data:
            table_name = table.get('name', '').lower()
            description = table.get('descr', '').lower()
            
            # Categorize tables
            if ('background' in description or 'suggested characteristics' in table_name or 
                'personality' in table_name or 'ideal' in table_name or 'bond' in table_name or 
                'flaw' in table_name or 'specialty' in table_name or 'routine' in table_name or
                'origin' in table_name or 'defining event' in table_name or 'schemes' in table_name or
                'business' in table_name or 'seclusion' in table_name):
                background_tables.append(table)
            else:
                other_tables.append(table)
        
        # Add background tables section
        if background_tables:
            markdown_content.append("## Character Background Tables")
            markdown_content.append("These tables are used for character creation and background development.")
            markdown_content.append("")
            
            for table in background_tables:
                markdown_content.append(format_table_to_markdown(table))
        
        # Add other tables section
        if other_tables:
            markdown_content.append("## Game Mechanics Tables")
            markdown_content.append("These tables are used for various game mechanics and spell effects.")
            markdown_content.append("")
            
            for table in other_tables:
                markdown_content.append(format_table_to_markdown(table))
        
        return "\n".join(markdown_content)
        
    except json.JSONDecodeError as e:
        return f"Error parsing JSON file: {e}"
    except FileNotFoundError:
        return f"File not found: {json_file}"
    except Exception as e:
        return f"Error processing file: {e}"

def main():
    """Main function to convert tables"""
    script_dir = Path(__file__).parent
    json_file = script_dir / "tables.json"
    output_file = script_dir / "tables_converted.md"
    
    if not json_file.exists():
        print(f"Error: {json_file} not found")
        return
    
    print("Converting tables.json to markdown...")
    markdown_content = convert_tables_to_markdown(json_file)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(markdown_content)
    
    print(f"Tables converted and saved to: {output_file}")
    
    # Count tables for summary
    with open(json_file, 'r', encoding='utf-8') as f:
        tables_data = json.load(f)
    
    print(f"Converted {len(tables_data)} tables to markdown format")

if __name__ == "__main__":
    main()
