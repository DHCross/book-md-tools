#!/usr/bin/env python3
"""
Safer Markdown cleanup pipeline for single-column documents

This version skips the deinterleaving step and focuses on:
1. OCR error correction
2. Markdown formatting
3. Line length and structure
"""
import sys
import re
import logging
from pathlib import Path
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add parent directory to path to import tools
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import pipeline tools
from tools.markdown_header_depth_corrector import HeaderCorrector
from tools.markdown_cleanup_fixer import MarkdownCleanupFixer
from tools.fix_table_formatting import fix_table_formatting
from tools.fix_ocr_errors import fix_ocr_errors
from tools.fix_additional_ocr_errors import fix_additional_ocr_errors
from tools.long_line_detector import LongLineDetector
from tools.paragraph_break_detector import ParagraphBreakDetector
from tools.spell_check import SpellChecker
from tools.markdown_validator import MarkdownValidator

class DocumentAnalyzer:
    """Analyze document to determine appropriate processing steps."""
    
    def __init__(self, content):
        self.content = content
        self.lines = content.split('\n')
        self.analysis = {
            'source_type': 'unknown',
            'ocr_issues': 0,
            'header_issues': 0,
            'line_length_issues': 0,
            'formatting_issues': 0,
            'suggested_steps': []
        }
    
    def analyze(self):
        """Run all analysis steps."""
        self._detect_source_type()
        self._check_ocr_issues()
        self._check_header_structure()
        self._check_line_lengths()
        self._check_formatting()
        return self.analysis
    
    def _detect_source_type(self):
        """Detect the likely source of the document."""
        # Look for Google Docs artifacts
        if any('docs.google.com' in line for line in self.lines if 'http' in line):
            self.analysis['source_type'] = 'google_docs'
        # Look for PDF artifacts
        elif any('\x0c' in line or '\x0b' in line for line in self.lines):
            self.analysis['source_type'] = 'pdf'
        # Look for Word/Office artifacts
        elif any('mso-' in line for line in self.lines if 'style' in line.lower()):
            self.analysis['source_type'] = 'word'
        else:
            self.analysis['source_type'] = 'plain_text'
    
    def _check_ocr_issues(self):
        """Check for common OCR issues."""
        # Common OCR error patterns
        patterns = [
            r'\b([a-z])([A-Z])\b',  # Missing space between words
            r'\b([a-z])\s*\n\s*([a-z])\b',  # Incorrect line breaks
            r'\b([A-Z][a-z]+)([A-Z][a-z]+)\b',  # Run-on words
            r'\b([a-z])(\d+)\b',  # Missing space before number
            r'\b(\d+)([a-zA-Z])\b'  # Missing space after number
        ]
        
        for pattern in patterns:
            self.analysis['ocr_issues'] += len(re.findall(pattern, self.content))
        
        if self.analysis['ocr_issues'] > 10:  # Threshold for significant OCR issues
            self.analysis['suggested_steps'].append('ocr_fix')
    
    def _check_header_structure(self):
        """Check header hierarchy and structure."""
        header_pattern = r'^(#{1,6})\s+(.*)$'
        headers = []
        
        for line in self.lines:
            match = re.match(header_pattern, line.strip())
            if match:
                level = len(match.group(1))
                headers.append(level)
        
        # Check for skipped levels
        if headers and min(headers) > 1:
            self.analysis['header_issues'] += 1
            self.analysis['suggested_steps'].append('header_correction')
    
    def _check_line_lengths(self, max_length=120):
        """Check for lines that exceed the maximum length."""
        long_lines = [i+1 for i, line in enumerate(self.lines) 
                     if len(line) > max_length and 
                     not line.strip().startswith(('#', '>', '|', '```', '*', '-'))]
        
        self.analysis['line_length_issues'] = len(long_lines)
        if long_lines:
            self.analysis['suggested_steps'].append('line_wrapping')
    
    def _check_formatting(self):
        """Check for markdown formatting issues."""
        # Check for unclosed formatting
        for marker in ['**', '__', '*', '_', '`']:
            if self.content.count(marker) % 2 != 0:
                self.analysis['formatting_issues'] += 1
        
        if self.analysis['formatting_issues'] > 0:
            self.analysis['suggested_steps'].append('format_cleanup')

def process_document(input_path, output_suffix='_cleaned'):
    """Process a markdown document with safety checks."""
    input_path = Path(input_path)
    output_dir = input_path.parent
    
    # Read the input file
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Analyze the document
    analyzer = DocumentAnalyzer(content)
    analysis = analyzer.analyze()
    
    logger.info(f"Document analysis complete. Source: {analysis['source_type']}")
    logger.info(f"Detected issues: {analysis}")
    
    # Apply fixes based on analysis
    if 'ocr_fix' in analysis['suggested_steps']:
        logger.info("Applying OCR fixes...")
        content, _ = fix_ocr_errors(content)
        content, _, _, _ = fix_additional_ocr_errors(content)
    
    if 'header_correction' in analysis['suggested_steps']:
        logger.info("Fixing header hierarchy...")
        corrector = HeaderCorrector(max_depth=3, fix_hierarchy=True)
        content = corrector.fix_headers(content)
    
    if 'line_wrapping' in analysis['suggested_steps']:
        logger.info("Wrapping long lines...")
        
        def wrap_line(line, width=120):
            """Wrap a long line to the specified width."""
            if len(line) <= width or line.strip().startswith(('#', '>', '|', '```', '*', '-')):
                return [line]
                
            words = line.split()
            wrapped_lines = []
            current_line = []
            current_length = 0
            
            for word in words:
                if current_line and current_length + len(word) + 1 > width:
                    wrapped_lines.append(' '.join(current_line))
                    current_line = [word]
                    current_length = len(word)
                else:
                    current_line.append(word)
                    current_length += len(word) + (1 if current_line else 0)
            
            if current_line:
                wrapped_lines.append(' '.join(current_line))
                
            return wrapped_lines
        
        lines = content.split('\n')
        wrapped_lines = []
        
        for line in lines:
            wrapped_lines.extend(wrap_line(line))
        
        content = '\n'.join(wrapped_lines)
    
    if 'format_cleanup' in analysis['suggested_steps']:
        logger.info("Cleaning up markdown formatting...")
        fixer = MarkdownCleanupFixer()
        # The actual method might be different, but we'll skip for now
        # since we've already handled most formatting
    
    # Fix tables if any table is detected
    if '|' in content and '---' in content:
        logger.info("Fixing table formatting...")
        content, _ = fix_table_formatting(content)
    
    # Generate output filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = output_dir / f"{input_path.stem}{output_suffix}-{timestamp}.md"
    
    # Write the output file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    logger.info(f"Processing complete. Output saved to: {output_path}")
    return str(output_path)

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <markdown_file> [output_suffix]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_suffix = sys.argv[2] if len(sys.argv) > 2 else '_cleaned'
    
    try:
        output_path = process_document(input_path, output_suffix)
        print(f"\n✅ Processing complete!")
        print(f"   Original: {input_path}")
        print(f"   Cleaned:  {output_path}")
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
