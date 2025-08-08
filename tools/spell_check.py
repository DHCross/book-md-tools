#!/usr/bin/env python3
"""
Advanced Spell Checker for Markdown Documents
Uses multiple approaches to identify potential spelling errors
"""

import re
import sys
from datetime import datetime
from pathlib import Path
from collections import Counter, defaultdict
import urllib.request
import json

class SpellChecker:
    def __init__(self):
        # Common gaming/fantasy terms that may not be in standard dictionaries
        self.gaming_terms = {
            'adventurers', 'adventuring', 'halfling', 'halflings', 'dwarfs', 'dwarves', 
            'elves', 'gnomes', 'cleric', 'clerics', 'fighter', 'fighters', 'wizards',
            'magic-user', 'magic-users', 'rogue', 'rogues', 'paladin', 'paladins',
            'longsword', 'shortsword', 'crossbow', 'chainmail', 'platemail', 'studded',
            'halberd', 'halberds', 'morningstar', 'warhammer', 'battleaxe',
            'dungeon', 'dungeons', 'tavern', 'taverns', 'innkeeper', 'barmaid',
            'guildmaster', 'guildmasters', 'thieves', 'brigands', 'bandits',
            'bailiff', 'bailiffs', 'serjeant', 'serjeants', 'constable', 'marshal',
            'gatehouse', 'gatehouses', 'portcullis', 'battlements', 'crenellated',
            'loopholes', 'embrasures', 'barbican', 'postern', 'sally-port',
            'yggsburgh', 'zagyg', 'dunfalcon', 'talworth', 'nemo', 'greypools',
            'menhir', 'serpent', 'ashwood', 'wynchwood', 'deerwood', 'buckswood'
        }
        
        # Common proper nouns that should be accepted
        self.proper_nouns = {
            'yggsburgh', 'zagyg', 'dunfalcon', 'talworth', 'uvoll', 'darktran',
            'edgar', 'yggs', 'bigfish', 'coldsprings', 'eastgate', 'westgate',
            'northgate', 'southgate', 'bridgegate', 'moatgate', 'rivergate',
            'crossgates', 'townbridge', 'moatbridge', 'urtford', 'garham',
            'coverdale', 'wilber', 'gregson', 'aloysius', 'duffy', 'jarvis',
            'warren', 'robert', 'drakmont', 'davis', 'proctor', 'brandon',
            'beasley', 'basil', 'holdar', 'reginald', 'dunstone', 'macronald',
            'weyforth', 'albert', 'goshert', 'diana', 'silva', 'viner'
        }
        
        # Common abbreviations and acronyms
        self.abbreviations = {
            'hp', 'ac', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'pa', 'eq',
            'vs', 'pc', 'npc', 'dm', 'gm', 'ck', 'xp', 'gp', 'sp', 'cp',
            'st', 'nd', 'rd', 'th', 'etc', 'ie', 'eg', 'ca', 'ft', 'sq'
        }
        
        # Load basic English word frequency list
        self.common_words = self._load_common_words()
        
    def _load_common_words(self):
        """Load a basic set of common English words"""
        # Basic common words - in a real implementation, you'd load from a comprehensive dictionary
        common = {
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
            'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
            'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
            'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
            'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
            'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year',
            'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
            'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
            'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
            'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most',
            'us', 'is', 'water', 'long', 'find', 'here', 'thing', 'where', 'much',
            'too', 'very', 'still', 'man', 'large', 'must', 'big', 'under', 'might',
            'such', 'follow', 'act', 'why', 'ask', 'men', 'change', 'went', 'light',
            'kind', 'off', 'need', 'house', 'picture', 'try', 'again', 'animal',
            'point', 'mother', 'world', 'near', 'build', 'self', 'earth', 'father',
            'head', 'stand', 'own', 'page', 'should', 'country', 'found', 'answer',
            'school', 'grow', 'study', 'learn', 'plant', 'cover', 'food', 'sun',
            'four', 'between', 'state', 'keep', 'eye', 'never', 'last', 'let',
            'thought', 'city', 'tree', 'cross', 'farm', 'hard', 'start', 'story',
            'saw', 'far', 'sea', 'draw', 'left', 'late', 'run', 'press', 'close',
            'night', 'real', 'life', 'few', 'north', 'open', 'seem', 'together',
            'next', 'white', 'children', 'begin', 'got', 'walk', 'example', 'ease',
            'paper', 'group', 'always', 'music', 'those', 'both', 'mark', 'often',
            'letter', 'until', 'mile', 'river', 'car', 'feet', 'care', 'second',
            'book', 'carry', 'took', 'science', 'eat', 'room', 'friend', 'began',
            'idea', 'fish', 'mountain', 'stop', 'once', 'base', 'hear', 'horse',
            'cut', 'sure', 'watch', 'color', 'face', 'wood', 'main', 'enough',
            'plain', 'girl', 'usual', 'young', 'ready', 'above', 'ever', 'red',
            'list', 'though', 'feel', 'talk', 'bird', 'soon', 'body', 'dog',
            'family', 'direct', 'leave', 'song', 'measure', 'door', 'product',
            'black', 'short', 'numeral', 'class', 'wind', 'question', 'happen',
            'complete', 'ship', 'area', 'half', 'rock', 'order', 'fire', 'south',
            'problem', 'piece', 'told', 'knew', 'pass', 'since', 'top', 'whole',
            'king', 'space', 'heard', 'best', 'hour', 'better', 'during', 'hundred',
            'five', 'remember', 'step', 'early', 'hold', 'west', 'ground', 'interest',
            'reach', 'fast', 'verb', 'sing', 'listen', 'six', 'table', 'travel',
            'less', 'morning', 'ten', 'simple', 'several', 'vowel', 'toward',
            'war', 'lay', 'against', 'pattern', 'slow', 'center', 'love', 'person',
            'money', 'serve', 'appear', 'road', 'map', 'rain', 'rule', 'govern',
            'pull', 'cold', 'notice', 'voice', 'unit', 'power', 'town', 'fine',
            'certain', 'fly', 'fall', 'lead', 'cry', 'dark', 'machine', 'note',
            'wait', 'plan', 'figure', 'star', 'box', 'noun', 'field', 'rest',
            'correct', 'able', 'pound', 'done', 'beauty', 'drive', 'stood',
            'contain', 'front', 'teach', 'week', 'final', 'gave', 'green', 'quick',
            'develop', 'ocean', 'warm', 'free', 'minute', 'strong', 'special',
            'mind', 'behind', 'clear', 'tail', 'produce', 'fact', 'street', 'inch',
            'multiply', 'nothing', 'course', 'stay', 'wheel', 'full', 'force',
            'blue', 'object', 'decide', 'surface', 'deep', 'moon', 'island',
            'foot', 'system', 'busy', 'test', 'record', 'boat', 'common', 'gold',
            'possible', 'plane', 'stead', 'dry', 'wonder', 'laugh', 'thousands',
            'ago', 'ran', 'check', 'game', 'shape', 'equate', 'hot', 'miss',
            'brought', 'heat', 'snow', 'tire', 'bring', 'yes', 'distant', 'fill',
            'east', 'paint', 'language', 'among'
        }
        return common

    def extract_words(self, text):
        """Extract words from text, handling markdown syntax"""
        # Remove markdown syntax
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # Bold
        text = re.sub(r'\*([^*]+)\*', r'\1', text)      # Italic
        text = re.sub(r'`[^`]+`', '', text)             # Code
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # Links
        text = re.sub(r'#{1,6}\s+', '', text)           # Headers
        text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)  # Lists
        text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)  # Numbered lists
        
        # Extract words (letters, apostrophes, hyphens)
        words = re.findall(r"\b[a-zA-Z][a-zA-Z'-]*[a-zA-Z]\b|\b[a-zA-Z]\b", text.lower())
        return words

    def is_likely_misspelled(self, word):
        """Check if a word is likely misspelled"""
        word_lower = word.lower()
        
        # Skip if it's a known good word
        if word_lower in self.common_words:
            return False
        if word_lower in self.gaming_terms:
            return False
        if word_lower in self.proper_nouns:
            return False
        if word_lower in self.abbreviations:
            return False
            
        # Skip short words and numbers
        if len(word) <= 2:
            return False
        if word.isdigit():
            return False
            
        # Skip proper nouns (capitalized words)
        if word[0].isupper() and len(word) > 3:
            return False
            
        # Check for common patterns that indicate misspelling
        suspicious_patterns = [
            r'[aeiou]{3,}',      # Too many vowels in a row
            r'[bcdfghjklmnpqrstvwxyz]{4,}',  # Too many consonants
            r'(.)\1{3,}',        # Same letter repeated 4+ times
            r'^[qxz]',           # Words starting with uncommon letters
            r'[qxz]$',           # Words ending with uncommon letters
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, word_lower):
                return True
                
        # If word is very long and not recognized, flag it
        if len(word) > 12:
            return True
            
        # If word has unusual letter combinations
        unusual_combos = ['bq', 'cj', 'cv', 'dx', 'fq', 'fx', 'gq', 'gx', 
                         'hx', 'jq', 'jx', 'kq', 'kx', 'mx', 'px', 'qb',
                         'qc', 'qd', 'qf', 'qg', 'qh', 'qj', 'qk', 'ql',
                         'qm', 'qn', 'qp', 'qr', 'qs', 'qt', 'qv', 'qw',
                         'qx', 'qy', 'qz', 'vf', 'vj', 'vq', 'vx', 'wx',
                         'xj', 'xq', 'xv', 'xz', 'zj', 'zq', 'zx']
        
        for combo in unusual_combos:
            if combo in word_lower:
                return True
                
        return False

    def check_document(self, content):
        """Check entire document for spelling errors"""
        words = self.extract_words(content)
        word_counts = Counter(words)
        
        potential_errors = []
        for word, count in word_counts.items():
            if self.is_likely_misspelled(word):
                potential_errors.append((word, count))
        
        return sorted(potential_errors, key=lambda x: x[1], reverse=True)

    def find_word_contexts(self, content, word, max_contexts=5):
        """Find contexts where a potentially misspelled word appears"""
        contexts = []
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            if word.lower() in line.lower():
                # Get some context around the line
                start_line = max(0, i - 1)
                end_line = min(len(lines), i + 2)
                context = '\n'.join(lines[start_line:end_line])
                contexts.append(f"Line {i+1}: {context}")
                
                if len(contexts) >= max_contexts:
                    break
                    
        return contexts

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 spell_check.py <input_file>")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    
    if not input_file.exists():
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
    
    print(f"Spell checking: {input_file}")
    
    # Read input file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading input file: {e}")
        sys.exit(1)
    
    # Initialize spell checker
    checker = SpellChecker()
    
    # Check for potential spelling errors
    print("Analyzing document for potential spelling errors...")
    potential_errors = checker.check_document(content)
    
    # Generate report
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_file = input_file.parent / f"{input_file.stem}_spell_check_report.txt"
    
    report_content = f"""Spell Check Report - {timestamp}
========================================

Input file: {input_file.name}
Total words analyzed: {len(checker.extract_words(content))}
Potential spelling errors found: {len(potential_errors)}

Potential Spelling Errors (sorted by frequency):
===============================================
"""
    
    if potential_errors:
        for word, count in potential_errors[:50]:  # Top 50 potential errors
            report_content += f"\n'{word}' (appears {count} time{'s' if count > 1 else ''})\n"
            contexts = checker.find_word_contexts(content, word, 3)
            for context in contexts:
                report_content += f"  {context}\n"
            report_content += "\n"
    else:
        report_content += "\nNo obvious spelling errors detected.\n"
    
    report_content += f"""
Summary:
--------
- Document appears to be mostly clean
- Review the flagged words above for potential corrections
- Many gaming/fantasy terms are automatically excluded
- Proper nouns and abbreviations are filtered out
- Consider manual review of any remaining flagged words

Note: This is an automated check. Manual review is recommended for final proofreading.
"""
    
    # Write report
    try:
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_content)
        print(f"✓ Spell check report saved as: {report_file}")
    except Exception as e:
        print(f"Error writing report file: {e}")
        sys.exit(1)
    
    print(f"\n📊 Spell Check Summary:")
    print(f"   Potential errors found: {len(potential_errors)}")
    if potential_errors:
        print(f"   Top potential errors:")
        for word, count in potential_errors[:10]:
            print(f"     '{word}' ({count} times)")
    else:
        print("   No obvious spelling errors detected!")
    
    print(f"\nFull report available in: {report_file}")

if __name__ == "__main__":
    main()
