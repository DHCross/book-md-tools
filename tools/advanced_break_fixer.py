#!/usr/bin/env python3
"""
Advanced Mid-word and Sentence Break Fixer for Markdown Files
Created for the TLG publishing workflow.

This script detects and fixes various types of paragraph break artifacts:
- Mid-word breaks (e.g., "Those socially" / "conscious females")
- Hyphenated word splits (e.g., "heavy-" / "handed")
- Sentence breaks with conjunctions, prepositions, articles
- Lines starting with continuation words
- Orphaned words and incomplete sentences
- Sentences split by blank lines (e.g., "The most powerful figures decided that being a permanent council member" followed by blank line and "was better than risking...")

Version: 2.2
Author: TLG Publishing Workflow Assistant
"""

import re
import sys
import argparse

def fix_mid_word_breaks(content):
    """Fix mid-word breaks and sentence continuation issues"""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    fixes_made = 0
    
    while i < len(lines):
        current_line = lines[i]
        
        # Skip empty lines, markdown headers, and special formatting
        if (not current_line.strip() or 
            current_line.startswith('#') or 
            current_line.startswith('**') or
            current_line.startswith('|') or
            current_line.strip().startswith('-') or
            current_line.strip().startswith('*')):
            fixed_lines.append(current_line)
            i += 1
            continue
        
        # Look ahead to next non-empty line
        next_line = ""
        next_idx = i + 1
        while next_idx < len(lines) and not lines[next_idx].strip():
            next_idx += 1
        if next_idx < len(lines):
            next_line = lines[next_idx]
        
        # Skip if next line is special formatting
        if (next_line.startswith('#') or 
            next_line.startswith('**') or
            next_line.startswith('|') or
            next_line.strip().startswith('-') or
            next_line.strip().startswith('*')):
            fixed_lines.append(current_line)
            i += 1
            continue
        
        should_join = False
        
        # Pattern 1: Line ends with incomplete phrases that should continue
        incomplete_endings = [
            # Articles
            r'\b(a|an|the)\s*$',
            # Prepositions
            r'\b(at|by|for|from|in|of|on|to|with|above|below|after|before|beyond|under|over|through|into|upon|across|around|about|against|among|between|during|within|without)\s*$',
            # Conjunctions
            r'\b(and|but|or|so|yet|nor|for)\s*$',
            # Determiners
            r'\b(this|that|these|those|each|every|all|some|any|many|much|more|most|few|little|less|least|several|both|either|neither)\s*$',
            # Incomplete verbs (common auxiliary verbs)
            r'\b(is|are|was|were|be|been|being|have|has|had|will|would|could|should|might|may|must|can|do|does|did)\s*$',
            # Incomplete action verbs (common ones)
            r'\b(goes|comes|takes|makes|gives|gets|puts|stands|sits|runs|walks|looks|seems|appears|becomes|remains|stays|follows|needs|wants|works|lives|holds|means|falls|allows)\s*$',
            # Relative pronouns and question words
            r'\b(who|whom|whose|which|what|when|where|why|how)\s*$'
        ]
        
        for pattern in incomplete_endings:
            if re.search(pattern, current_line, re.IGNORECASE):
                should_join = True
                break
        
        # Pattern 1.5: Hyphenated word splits (e.g., "heavy-" at end of line)
        if not should_join and next_line:
            # Check for hyphen at end of current line
            if re.search(r'-\s*$', current_line):
                should_join = True
        
        # Pattern 2: Next line starts with continuation words
        if next_line:
            continuation_starts = [
                # Continuation words
                r'^\s*(however|thus|therefore|nevertheless|furthermore|moreover|likewise|also|then|so|and|but|or|yet|still|besides|additionally|consequently|hence|accordingly|meanwhile|otherwise|nonetheless|instead|rather|indeed|certainly|surely|clearly|obviously|particularly|especially|specifically|generally|typically|usually|normally|actually|really|quite|very|extremely|highly|fairly|rather|somewhat|perhaps|maybe|possibly|probably|likely|apparently|evidently|fortunately|unfortunately|surprisingly|interestingly|importantly|significantly|notably|remarkably|undoubtedly|definitely|absolutely|completely|entirely|totally|fully|partly|partially|mainly|mostly|largely|primarily|chiefly|principally|basically|essentially|fundamentally|ultimately|finally|eventually|gradually|suddenly|immediately|instantly|quickly|rapidly|slowly|carefully|gently|quietly|loudly|clearly|briefly|shortly|recently|currently|presently|nowadays|previously|formerly|originally|initially|firstly|secondly|thirdly|finally|lastly|similarly|differently|conversely|alternatively|instead|rather|comparatively|relatively|approximately|roughly|exactly|precisely|specifically|particularly|especially|notably|remarkably|significantly|importantly|surprisingly|fortunately|unfortunately|clearly|obviously|apparently|evidently|presumably|supposedly|allegedly|reportedly|arguably|arguably|admittedly|honestly|frankly|seriously|literally|virtually|practically|effectively|essentially|basically|fundamentally|ultimately|eventually|gradually|suddenly|immediately|instantly|quickly|rapidly|slowly|carefully|gently|quietly|loudly|briefly|shortly|recently|currently|presently|nowadays|previously|formerly|originally|initially|similarly|differently|comparatively|relatively|approximately|roughly|exactly|precisely)\b',
                # Words that clearly continue a sentence
                r'^\s*(conscious|aware|minded|oriented|focused|concerned|interested|engaged|involved|committed|dedicated|devoted|intended|designed|meant|supposed|expected|required|needed|wanted|desired|sought|planned|arranged|organized|prepared|ready|willing|able|capable|qualified|suitable|appropriate|proper|correct|right|wrong|false|true|real|actual|genuine|authentic|original|natural|normal|regular|standard|typical|usual|common|ordinary|simple|basic|fundamental|essential|important|significant|major|minor|main|primary|secondary|central|key|crucial|critical|vital|necessary|required|optional|additional|extra|special|particular|specific|general|broad|wide|narrow|limited|restricted|confined|contained|included|excluded|involved|related|connected|linked|associated|attached|joined|combined|united|separated|divided|split|broken|damaged|destroyed|ruined|lost|missing|found|discovered|identified|recognized|known|unknown|familiar|unfamiliar|strange|odd|unusual|weird|bizarre|curious|interesting|fascinating|amazing|incredible|remarkable|extraordinary|exceptional|outstanding|excellent|perfect|ideal|wonderful|marvelous|fantastic|great|good|bad|poor|terrible|awful|horrible|dreadful|frightening|scary|dangerous|risky|safe|secure|protected|defended|guarded|watched|observed|noticed|seen|heard|felt|touched|tasted|smelled)\b'
            ]
            
            for pattern in continuation_starts:
                if re.search(pattern, next_line, re.IGNORECASE):
                    should_join = True
                    break
        
        # Pattern 3: Orphaned single words (very short lines that don't look like headers)
        if (len(current_line.split()) <= 2 and 
            not current_line.startswith('#') and 
            not current_line.startswith('**') and
            current_line.strip() and
            not current_line.strip().endswith(':') and
            next_line and len(next_line.split()) > 2):
            should_join = True
        
        if should_join and next_line:
            # Join the lines
            joined_line = current_line.rstrip() + " " + next_line.lstrip()
            fixed_lines.append(joined_line)
            fixes_made += 1
            
            # Skip empty lines after the next line
            i = next_idx + 1
            while i < len(lines) and not lines[i].strip():
                i += 1
        else:
            fixed_lines.append(current_line)
            i += 1
    
    return '\n'.join(fixed_lines), fixes_made

def fix_sentence_blank_line_splits(content):
    """Fix sentences that are split by blank lines"""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    fixes_made = 0
    
    while i < len(lines):
        current_line = lines[i]
        
        # Skip empty lines, markdown headers, and special formatting
        if (not current_line.strip() or 
            current_line.startswith('#') or 
            current_line.startswith('**') or
            current_line.startswith('|') or
            current_line.strip().startswith('-') or
            current_line.strip().startswith('*')):
            fixed_lines.append(current_line)
            i += 1
            continue
        
        # Look for a line that doesn't end with sentence-ending punctuation
        # but appears to be an incomplete sentence
        if (current_line.strip() and 
            not re.search(r'[.!?:;]\s*$', current_line) and
            not current_line.strip().endswith(',') and
            len(current_line.split()) > 3):  # Must be substantial text
            
            # Look ahead for blank line(s) followed by a line that could continue the sentence
            next_idx = i + 1
            blank_lines_count = 0
            
            # Count blank lines
            while next_idx < len(lines) and not lines[next_idx].strip():
                blank_lines_count += 1
                next_idx += 1
            
            # If we found blank lines and there's a following line
            if blank_lines_count > 0 and next_idx < len(lines):
                next_line = lines[next_idx]
                
                # Skip if next line is special formatting
                if (next_line.startswith('#') or 
                    next_line.startswith('**') or
                    next_line.startswith('|') or
                    next_line.strip().startswith('-') or
                    next_line.strip().startswith('*')):
                    fixed_lines.append(current_line)
                    i += 1
                    continue
                
                # Check if the next line appears to continue the sentence
                should_join = False
                
                # Pattern 1: Next line starts with lowercase word (strong indicator)
                if re.match(r'^\s*[a-z]', next_line):
                    should_join = True
                
                # Pattern 2: Next line starts with common continuation words
                continuation_words = [
                    r'^\s*(was|were|is|are|had|has|have|will|would|could|should|might|may|must|can|do|does|did)\b',
                    r'^\s*(and|but|or|so|yet|nor|for|then|thus|also|still|however|therefore|nevertheless)\b',
                    r'^\s*(better|worse|more|less|greater|smaller|higher|lower|stronger|weaker|faster|slower)\b',
                    r'^\s*(than|rather|instead|before|after|during|while|until|since|because|although|though)\b'
                ]
                
                for pattern in continuation_words:
                    if re.search(pattern, next_line, re.IGNORECASE):
                        should_join = True
                        break
                
                # Pattern 3: Current line seems to end mid-thought
                mid_thought_endings = [
                    r'\bthat\s*$',
                    r'\bwhich\s*$', 
                    r'\bwho\s*$',
                    r'\bwhere\s*$',
                    r'\bwhen\s*$',
                    r'\bhow\s*$',
                    r'\bwhy\s*$',
                    r'\bbeing\s*$',
                    r'\bhaving\s*$',
                    r'\bdecided\s*$',
                    r'\bthought\s*$',
                    r'\bfelt\s*$',
                    r'\bknew\s*$',
                    r'\bmember\s*$',  # As in "council member"
                    r'\bcouncil\s*$',
                    r'\bcommittee\s*$',
                    r'\bgroup\s*$',
                    r'\bteam\s*$'
                ]
                
                for pattern in mid_thought_endings:
                    if re.search(pattern, current_line, re.IGNORECASE):
                        should_join = True
                        break
                
                if should_join:
                    # Join the lines, preserving one space between them
                    joined_line = current_line.rstrip() + " " + next_line.lstrip()
                    fixed_lines.append(joined_line)
                    fixes_made += 1
                    
                    # Skip the blank lines and the joined line
                    i = next_idx + 1
                    continue
        
        fixed_lines.append(current_line)
        i += 1
    
    return '\n'.join(fixed_lines), fixes_made

def fix_hyphenated_word_splits(content):
    """Fix hyphenated words that are split across lines"""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    fixes_made = 0
    
    while i < len(lines):
        current_line = lines[i]
        
        # Look for lines ending with a hyphen
        if re.search(r'-\s*$', current_line) and i + 1 < len(lines):
            next_line = lines[i + 1]
            
            # Skip if next line is empty or special formatting
            if (next_line.strip() and 
                not next_line.startswith('#') and 
                not next_line.startswith('**') and
                not next_line.startswith('|')):
                
                # Join the hyphenated word
                joined_line = current_line.rstrip() + next_line.lstrip()
                fixed_lines.append(joined_line)
                fixes_made += 1
                i += 2  # Skip the next line since we've joined it
                continue
        
        fixed_lines.append(current_line)
        i += 1
    
    return '\n'.join(fixed_lines), fixes_made

def main():
    parser = argparse.ArgumentParser(
        description='Fix mid-word breaks, sentence continuation issues, hyphenated word splits, and sentence blank line splits in Markdown files',
        epilog='''
Examples:
    python3 advanced_break_fixer.py document.md
    python3 advanced_break_fixer.py --output fixed_document.md document.md
    
This tool was created for the TLG publishing workflow to help fix
paragraph break artifacts that occur during document conversion.
        '''
    )
    
    parser.add_argument('file', help='Markdown file to fix')
    parser.add_argument('--output', help='Output file (default: overwrite input)')
    parser.add_argument('--preview', action='store_true', help='Preview changes without applying them')
    
    args = parser.parse_args()
    
    try:
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File '{args.file}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
    
    print(f"🔧 Fixing mid-word breaks, sentence continuation issues, hyphenated word splits, and sentence blank line splits in '{args.file}'...")
    
    # Apply fixes
    fixed_content, fixes_made = fix_mid_word_breaks(content)
    
    # Apply hyphenated word splits fix
    hyphen_fixes, hyphen_fixes_made = fix_hyphenated_word_splits(fixed_content)
    
    # Apply sentence blank line splits fix
    blank_line_fixes, blank_line_fixes_made = fix_sentence_blank_line_splits(hyphen_fixes)
    
    # Combine fixes
    fixed_content = blank_line_fixes
    total_fixes = fixes_made + hyphen_fixes_made + blank_line_fixes_made
    
    print(f"✅ Fixed {fixes_made} mid-word/continuation breaks")
    print(f"✅ Fixed {hyphen_fixes_made} hyphenated word splits")
    print(f"✅ Fixed {blank_line_fixes_made} sentence blank line splits")
    print(f"✅ Total fixes: {total_fixes}")
    
    if args.preview:
        print("Preview mode - no changes written to file")
        return
    
    # Write output
    output_file = args.output or args.file
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"📄 Fixes written to '{output_file}'")
    except Exception as e:
        print(f"Error writing file: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
