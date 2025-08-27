#!/usr/bin/env python3
"""
XML to Text Converter for D&D Beyond Files
Converts module.xml and compendium.xml files to readable text format
"""

import xml.etree.ElementTree as ET
import html
import re
import sys
import os
from pathlib import Path

def clean_html_content(content):
    """Convert HTML content to clean readable text"""
    if not content:
        return ""
    
    # Decode HTML entities
    content = html.unescape(content)
    
    # Replace common HTML tags with text equivalents
    replacements = {
        '<br>': '\n',
        '<br/>': '\n',
        '<br />': '\n',
        '<p>': '\n',
        '</p>': '\n',
        '<div>': '\n',
        '</div>': '\n',
        '<h1>': '\n# ',
        '</h1>': '\n',
        '<h2>': '\n## ',
        '</h2>': '\n',
        '<h3>': '\n### ',
        '</h3>': '\n',
        '<h4>': '\n#### ',
        '</h4>': '\n',
        '<h5>': '\n##### ',
        '</h5>': '\n',
        '<h6>': '\n###### ',
        '</h6>': '\n',
        '<strong>': '**',
        '</strong>': '**',
        '<b>': '**',
        '</b>': '**',
        '<em>': '*',
        '</em>': '*',
        '<i>': '*',
        '</i>': '*',
        '<u>': '_',
        '</u>': '_',
        '<li>': '\n• ',
        '</li>': '',
        '<ul>': '\n',
        '</ul>': '\n',
        '<ol>': '\n',
        '</ol>': '\n',
        '<table>': '\n',
        '</table>': '\n',
        '<tr>': '\n',
        '</tr>': '',
        '<td>': ' | ',
        '</td>': '',
        '<th>': ' | ',
        '</th>': '',
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&quot;': '"',
        '&apos;': "'",
    }
    
    # Apply replacements
    for html_tag, replacement in replacements.items():
        content = content.replace(html_tag, replacement)
    
    # Remove any remaining HTML tags
    content = re.sub(r'<[^>]+>', '', content)
    
    # Clean up extra whitespace
    content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)  # Remove triple+ newlines
    content = re.sub(r'[ \t]+', ' ', content)  # Replace multiple spaces/tabs with single space
    content = content.strip()
    
    return content

def convert_module_xml(xml_file):
    """Convert module.xml to readable text"""
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        output_lines = []
        
        # Get module info
        module_name = root.get('name', 'Unknown Module')
        output_lines.append(f"# {module_name}")
        output_lines.append("=" * len(module_name))
        output_lines.append("")
        
        # Get module description if available
        description = root.get('description', '')
        if description:
            output_lines.append("## Description")
            output_lines.append(clean_html_content(description))
            output_lines.append("")
        
        # Process pages
        pages = root.findall('.//page')
        for i, page in enumerate(pages, 1):
            page_name = page.get('name', f'Page {i}')
            page_slug = page.get('slug', '')
            
            output_lines.append(f"## {page_name}")
            if page_slug:
                output_lines.append(f"*Slug: {page_slug}*")
            output_lines.append("-" * len(page_name))
            output_lines.append("")
            
            # Get page content
            content_elem = page.find('content')
            if content_elem is not None and content_elem.text:
                clean_content = clean_html_content(content_elem.text)
                output_lines.append(clean_content)
                output_lines.append("")
                output_lines.append("---")
                output_lines.append("")
        
        return "\n".join(output_lines)
        
    except ET.ParseError as e:
        return f"Error parsing XML file: {e}"
    except Exception as e:
        return f"Error processing file: {e}"

def convert_compendium_xml(xml_file):
    """Convert compendium.xml to readable text"""
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        output_lines = []
        output_lines.append("# D&D Compendium")
        output_lines.append("================")
        output_lines.append("")
        
        # Process spells
        spells = root.findall('.//spell')
        if spells:
            output_lines.append("## Spells")
            output_lines.append("--------")
            output_lines.append("")
            
            for spell in spells:
                name = spell.find('name')
                level = spell.find('level')
                school = spell.find('school')
                ritual = spell.find('ritual')
                time = spell.find('time')
                classes = spell.find('classes')
                components = spell.find('components')
                duration = spell.find('duration')
                range_elem = spell.find('range')
                text = spell.find('text')
                source = spell.find('source')
                
                if name is not None:
                    spell_name = name.text or "Unknown Spell"
                    output_lines.append(f"### {spell_name}")
                    output_lines.append("")
                    
                    # Spell details
                    details = []
                    if level is not None and level.text:
                        level_text = "Cantrip" if level.text == "0" else f"Level {level.text}"
                        details.append(f"**Level:** {level_text}")
                    
                    if school is not None and school.text:
                        school_names = {
                            'A': 'Abjuration', 'C': 'Conjuration', 'D': 'Divination',
                            'EN': 'Enchantment', 'EV': 'Evocation', 'I': 'Illusion',
                            'N': 'Necromancy', 'T': 'Transmutation'
                        }
                        school_name = school_names.get(school.text, school.text)
                        details.append(f"**School:** {school_name}")
                    
                    if ritual is not None and ritual.text:
                        ritual_text = "Yes" if ritual.text == "YES" else "No"
                        details.append(f"**Ritual:** {ritual_text}")
                    
                    if time is not None and time.text:
                        details.append(f"**Casting Time:** {time.text}")
                    
                    if range_elem is not None and range_elem.text:
                        details.append(f"**Range:** {range_elem.text}")
                    
                    if components is not None and components.text:
                        details.append(f"**Components:** {components.text}")
                    
                    if duration is not None and duration.text:
                        details.append(f"**Duration:** {duration.text}")
                    
                    if classes is not None and classes.text:
                        details.append(f"**Classes:** {classes.text}")
                    
                    for detail in details:
                        output_lines.append(detail)
                    
                    output_lines.append("")
                    
                    # Spell description
                    if text is not None and text.text:
                        clean_description = clean_html_content(text.text)
                        output_lines.append(clean_description)
                        output_lines.append("")
                    
                    # Source
                    if source is not None and source.text:
                        output_lines.append(f"*Source: {source.text}*")
                        output_lines.append("")
                    
                    output_lines.append("---")
                    output_lines.append("")
        
        # Process other elements if they exist (monsters, items, etc.)
        for element_type in ['monster', 'item', 'race', 'class', 'background', 'feat']:
            elements = root.findall(f'.//{element_type}')
            if elements:
                element_title = element_type.title() + "s"
                output_lines.append(f"## {element_title}")
                output_lines.append("-" * len(element_title))
                output_lines.append("")
                
                for element in elements:
                    name_elem = element.find('name')
                    if name_elem is not None and name_elem.text:
                        output_lines.append(f"### {name_elem.text}")
                        output_lines.append("")
                        
                        # Add all child elements as details
                        for child in element:
                            if child.tag != 'name' and child.text:
                                clean_text = clean_html_content(child.text)
                                if clean_text:
                                    output_lines.append(f"**{child.tag.title()}:** {clean_text}")
                        
                        output_lines.append("")
                        output_lines.append("---")
                        output_lines.append("")
        
        return "\n".join(output_lines)
        
    except ET.ParseError as e:
        return f"Error parsing XML file: {e}"
    except Exception as e:
        return f"Error processing file: {e}"

def main():
    """Main function to convert XML files"""
    # Get the directory where the script is located
    script_dir = Path(__file__).parent
    
    # Define input and output files
    module_xml = script_dir / "module.xml"
    compendium_xml = script_dir / "compendium.xml"
    
    # Convert module.xml
    if module_xml.exists():
        print("Converting module.xml...")
        module_text = convert_module_xml(module_xml)
        
        output_file = script_dir / "module_converted.txt"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(module_text)
        print(f"Module converted and saved to: {output_file}")
    else:
        print(f"Warning: {module_xml} not found")
    
    # Convert compendium.xml
    if compendium_xml.exists():
        print("Converting compendium.xml...")
        compendium_text = convert_compendium_xml(compendium_xml)
        
        output_file = script_dir / "compendium_converted.txt"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(compendium_text)
        print(f"Compendium converted and saved to: {output_file}")
    else:
        print(f"Warning: {compendium_xml} not found")
    
    print("\nConversion complete!")

if __name__ == "__main__":
    main()
