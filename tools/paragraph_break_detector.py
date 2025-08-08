#!/usr/bin/env python3
"""
Paragraph Break Artifact Detector for Markdown Files

This script detects common paragraph break artifacts that occur when converting
documents from PDF → DOCX → Markdown, where sentences get broken across lines
inappropriately.

Usage:
    python3 paragraph_break_detector.py <markdown_file>
    python3 paragraph_break_detector.py --help

Common patterns detected:
- Lines ending with conjunctions (and, or, but, etc.)
- Lines ending with prepositions (of, in, at, on, etc.)
- Lines ending with articles (a, an, the)
- Lines ending with commas followed by short next lines
- Lines ending with "that" or "which"
- Single-word lines that should likely be joined
- Short connecting words at start of lines

Created for the Yggsburgh book preparation project.
Author: TLG Publishing Workflow
Date: August 2025
"""

import re
import sys
import argparse
from pathlib import Path
from typing import List, Tuple

class ParagraphBreakDetector:
    def __init__(self):
        # Words that commonly get orphaned at end of lines due to bad breaks
        self.end_conjunctions = ['and', 'or', 'but', 'yet', 'so', 'nor', 'for']
        self.end_prepositions = ['of', 'in', 'at', 'on', 'by', 'for', 'with', 'from', 'to', 'into', 'onto', 'upon', 'about', 'under', 'over', 'through', 'during', 'before', 'after', 'since', 'until', 'within', 'without', 'beneath', 'beyond', 'beside', 'between', 'among', 'against', 'across', 'around', 'behind', 'below', 'above', 'near', 'toward', 'towards']
        self.end_articles = ['a', 'an', 'the']
        self.end_determiners = ['this', 'that', 'these', 'those', 'some', 'any', 'each', 'every', 'all', 'both', 'either', 'neither', 'many', 'much', 'more', 'most', 'few', 'little', 'less', 'least', 'several', 'various']
        self.end_relative_pronouns = ['that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how']
        
        # Words that commonly start lines but should be connected to previous
        self.start_continuations = ['and', 'or', 'but', 'yet', 'so', 'however', 'therefore', 'thus', 'then', 'also', 'furthermore', 'moreover', 'nevertheless', 'nonetheless', 'meanwhile', 'likewise', 'similarly', 'consequently', 'accordingly']
        
    def analyze_file(self, filepath):
        """Analyze a markdown file for paragraph break artifacts."""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except FileNotFoundError:
            print(f"Error: File '{filepath}' not found.")
            return
        except Exception as e:
            print(f"Error reading file: {e}")
            return
            
        issues = []
        
        for i, line in enumerate(lines, 1):
            line = line.strip()
            
            # Skip empty lines, headers, and code blocks (but process blockquotes)
            if not line or line.startswith('#') or line.startswith('```'):
                continue
                
            # Check for lines ending with problematic words
            issues.extend(self._check_line_endings(line, i))
            
            # Check for comma at end followed by short next line
            if i < len(lines):
                issues.extend(self._check_comma_breaks(line, lines[i].strip(), i))
            
            # Check for single word lines that might be orphans
            issues.extend(self._check_orphan_words(line, i))
            
            # Check for lines starting with continuation words
            issues.extend(self._check_line_beginnings(line, i))
            
            # Check for broken sentences across blockquote boundaries
            if i < len(lines) - 1:
                issues.extend(self._check_blockquote_breaks(line, lines[i:i+2], i))
        
        # Detect mid-word breaks
        mid_word_issues = self.detect_mid_word_breaks(lines)
        for line_num, description, context in mid_word_issues:
            issues.append(f"Line {line_num}: {description}")
            
        return issues
    
    def _check_line_endings(self, line, line_num):
        """Check if line ends with problematic words."""
        issues = []
        
        # Handle blockquotes by removing the > prefix
        clean_text = line
        if line.startswith('>'):
            clean_text = line[1:].strip()
        
        # Skip empty blockquote lines
        if not clean_text:
            return issues
        
        # Remove punctuation for word checking
        clean_line = re.sub(r'[^\w\s]', '', clean_text.lower())
        words = clean_line.split()
        
        if not words:
            return issues
            
        last_word = words[-1]
        
        # Enhanced detection for incomplete sentences
        if last_word in self.end_conjunctions:
            issues.append(f"Line {line_num}: Ends with conjunction '{last_word}' - {line}")
        elif last_word in self.end_prepositions:
            issues.append(f"Line {line_num}: Ends with preposition '{last_word}' - {line}")
        elif last_word in self.end_articles:
            issues.append(f"Line {line_num}: Ends with article '{last_word}' - {line}")
        elif last_word in self.end_determiners:
            issues.append(f"Line {line_num}: Ends with determiner '{last_word}' - {line}")
        elif last_word in self.end_relative_pronouns:
            issues.append(f"Line {line_num}: Ends with relative pronoun '{last_word}' - {line}")
        # Additional check for incomplete verb phrases
        elif last_word in ['will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must', 'does', 'did', 'has', 'have', 'had', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being']:
            issues.append(f"Line {line_num}: Ends with incomplete verb '{last_word}' - {line}")
        # Check for lines ending with "wears", "says", "goes", etc. (incomplete actions)
        elif last_word.endswith('s') and len(last_word) > 3 and last_word[:-1] in ['wear', 'say', 'go', 'come', 'take', 'make', 'give', 'tell', 'know', 'think', 'see', 'get', 'use', 'find', 'work', 'call', 'try', 'ask', 'need', 'feel', 'become', 'leave', 'put', 'mean', 'keep', 'let', 'begin', 'seem', 'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain']:
            issues.append(f"Line {line_num}: Ends with incomplete action verb '{last_word}' - {line}")
            
        return issues
    
    def _check_comma_breaks(self, line, next_line, line_num):
        """Check for comma at end of line followed by short next line."""
        issues = []
        
        if line.endswith(',') and next_line and len(next_line.split()) <= 3:
            # Skip if next line is clearly a new paragraph (starts with capital) or special formatting
            if not (next_line[0].isupper() and not line.endswith(' ,')):
                issues.append(f"Line {line_num}: Comma break - '{line}' followed by short line '{next_line}'")
                
        return issues
    
    def _check_orphan_words(self, line, line_num):
        """Check for single words that might be orphaned."""
        issues = []
        
        words = line.split()
        if len(words) == 1 and not line.startswith('#') and not line.startswith('>'):
            word = words[0].lower().strip('.,!?;:')
            # Common words that get orphaned
            if word in ['the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'that', 'which', 'who', 'this', 'these', 'those']:
                issues.append(f"Line {line_num}: Possible orphaned word - {line}")
                
        return issues
    
    def _check_line_beginnings(self, line, line_num):
        """Check for lines starting with continuation words."""
        issues = []
        
        words = line.split()
        if words:
            first_word = words[0].lower().strip('.,!?;:')
            if first_word in self.start_continuations:
                issues.append(f"Line {line_num}: Starts with continuation word '{first_word}' - {line}")
                
        return issues
    
    def _check_blockquote_breaks(self, current_line, next_lines, line_num):
        """Check for broken sentences across blockquote boundaries."""
        issues = []
        
        # Only check lines within blockquotes
        if not current_line.startswith('>'):
            return issues
            
        # Get the actual text content
        current_text = current_line[1:].strip()
        if not current_text:
            return issues
            
        # Look at next two lines to find continuation patterns
        next_line = next_lines[0].strip() if len(next_lines) > 0 else ""
        following_line = next_lines[1].strip() if len(next_lines) > 1 else ""
        
        # Check if next line is empty blockquote and following line continues the sentence
        if next_line == ">" and following_line.startswith('>'):
            following_text = following_line[1:].strip()
            
            # Check for incomplete sentences that continue after empty blockquote
            current_words = current_text.split()
            following_words = following_text.split() if following_text else []
            
            if current_words and following_words:
                last_word = current_words[-1].lower()
                first_following_word = following_words[0].lower()
                
                # Pattern: "who wears" -> "his uniform"
                if last_word in ['who', 'which', 'that', 'where', 'when', 'whose']:
                    issues.append(f"Line {line_num}: Relative clause broken across blockquote - '{current_text}' continues as '{following_text}'")
                
                # Pattern: verb + object continuation
                elif last_word in ['wears', 'has', 'uses', 'holds', 'carries', 'takes', 'gives', 'shows', 'makes', 'does', 'says', 'tells', 'knows', 'sees', 'gets', 'finds', 'keeps', 'brings', 'puts', 'calls']:
                    issues.append(f"Line {line_num}: Verb-object phrase broken across blockquote - '{current_text}' continues as '{following_text}'")
                
                # Pattern: incomplete possessive or descriptive phrase
                elif (last_word in ['his', 'her', 'its', 'their', 'my', 'your', 'our'] or 
                      last_word in ['the', 'a', 'an', 'this', 'that', 'these', 'those'] or
                      last_word.endswith('s') and len(last_word) > 3):  # likely plural or possessive
                    issues.append(f"Line {line_num}: Incomplete phrase broken across blockquote - '{current_text}' continues as '{following_text}'")
        
        return issues
    
    def detect_mid_word_breaks(self, lines: List[str]) -> List[Tuple[int, str, str]]:
        """Detect lines that end with incomplete words followed by lines starting with the rest of the word."""
        issues = []
        
        for i in range(len(lines) - 1):
            current_line = lines[i].strip()
            next_line = lines[i + 1].strip()
            
            # Skip empty lines, headers, code blocks, etc.
            if not current_line or not next_line:
                continue
            if current_line.startswith('#') or next_line.startswith('#'):
                continue
            if current_line.startswith('```') or next_line.startswith('```'):
                continue
            if current_line.startswith('|') or next_line.startswith('|'):
                continue
                
            # Look for lines ending with partial words (not ending with punctuation or complete words)
            current_words = current_line.split()
            next_words = next_line.split()
            
            if not current_words or not next_words:
                continue
                
            last_word = current_words[-1]
            first_word = next_words[0]
            
            # Remove any blockquote markers for analysis
            if first_word.startswith('>'):
                first_word = first_word[1:].strip()
                if not first_word and len(next_words) > 1:
                    first_word = next_words[1]
            
            # Check for mid-word breaks:
            # 1. Last word doesn't end with sentence punctuation
            # 2. Last word is suspiciously short (likely truncated)
            # 3. First word of next line looks like it could complete the last word
            if (len(last_word) >= 3 and 
                not last_word[-1] in '.!?,:;' and
                len(first_word) >= 2 and
                not first_word[0].isupper() and
                not last_word.endswith('-')):  # Avoid hyphenated words
                
                # Additional heuristics for mid-word breaks
                combined_word = last_word + first_word
                
                # Check if this looks like a real word break
                if (len(combined_word) > 6 and  # Reasonable word length
                    combined_word.isalpha() and  # All letters
                    not last_word in ['the', 'and', 'but', 'for', 'with', 'from']):  # Not common complete words
                    
                    issues.append((i + 1, f"Mid-word break: '{last_word}' + '{first_word}' = '{combined_word}'", 
                                 f"Line {i+1}: ...{last_word}\nLine {i+2}: {first_word}..."))
        
        return issues
    
    def fix_mid_word_breaks(self, lines: List[str], issues: List[Tuple[int, str, str]]) -> List[str]:
        """Fix mid-word breaks by joining split words."""
        fixed_lines = lines.copy()
        
        # Process issues in reverse order to maintain line numbering
        for line_num, description, context in reversed(issues):
            if line_num < len(fixed_lines):
                current_line = fixed_lines[line_num - 1]
                next_line = fixed_lines[line_num] if line_num < len(fixed_lines) else ""
                
                if next_line:
                    current_words = current_line.split()
                    next_words = next_line.split()
                    
                    if current_words and next_words:
                        last_word = current_words[-1]
                        first_word = next_words[0]
                        
                        # Handle blockquote markers
                        blockquote_prefix = ""
                        if first_word.startswith('>'):
                            blockquote_prefix = "> "
                            first_word = first_word[1:].strip()
                            if not first_word and len(next_words) > 1:
                                first_word = next_words[1]
                                next_words = next_words[1:]
                            else:
                                next_words[0] = first_word
                        
                        # Combine the split word
                        combined_word = last_word + first_word
                        
                        # Update the lines
                        current_words[-1] = combined_word
                        remaining_words = next_words[1:] if len(next_words) > 1 else []
                        
                        fixed_lines[line_num - 1] = " ".join(current_words)
                        if remaining_words:
                            fixed_lines[line_num] = blockquote_prefix + " ".join(remaining_words)
                        else:
                            # Remove the now-empty line
                            fixed_lines.pop(line_num)
        
        return fixed_lines
    
    def print_summary(self, issues):
        """Print a summary of detected issues."""
        if not issues:
            print("✅ No paragraph break artifacts detected!")
            return
            
        print(f"🔍 Found {len(issues)} potential paragraph break artifacts:\n")
        
        # Group by issue type for better organization
        by_type = {}
        for issue in issues:
            issue_type = issue.split(':')[1].split('-')[0].strip()
            if issue_type not in by_type:
                by_type[issue_type] = []
            by_type[issue_type].append(issue)
        
        for issue_type, type_issues in by_type.items():
            print(f"📌 {issue_type.upper()}: ({len(type_issues)} issues)")
            for issue in type_issues[:10]:  # Limit to first 10 per type
                print(f"   {issue}")
            if len(type_issues) > 10:
                print(f"   ... and {len(type_issues) - 10} more")
            print()

def main():
    parser = argparse.ArgumentParser(
        description="Detect paragraph break artifacts in Markdown files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python3 paragraph_break_detector.py document.md
    python3 paragraph_break_detector.py --verbose document.md
    
This tool was created for the TLG publishing workflow to help identify
and fix paragraph break artifacts that occur during document conversion.
        """
    )
    
    parser.add_argument('file', help='Markdown file to analyze')
    parser.add_argument('-v', '--verbose', action='store_true', 
                       help='Show all issues (default shows max 10 per type)')
    parser.add_argument('--fix-mid-word', action='store_true',
                       help='Fix mid-word breaks automatically')
    parser.add_argument('--output', help='Output file for fixes (default: overwrite input)')
    
    args = parser.parse_args()
    
    if not Path(args.file).exists():
        print(f"Error: File '{args.file}' does not exist.")
        sys.exit(1)
    
    print(f"🔍 Analyzing '{args.file}' for paragraph break artifacts...\n")
    
    detector = ParagraphBreakDetector()
    issues = detector.analyze_file(args.file)
    
    if args.verbose:
        # Show all issues
        for issue in issues:
            print(issue)
    else:
        # Show organized summary
        detector.print_summary(issues)
    
    if issues:
        print(f"\n💡 Review these issues and fix manually using find/replace or sed commands.")
        print(f"   Common fixes involve joining lines or adjusting line breaks.")
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
