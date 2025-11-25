#!/usr/bin/env python3
import json
import sys
from scripts.cnc_stat_parser import extract_stat_blocks

if len(sys.argv) < 2:
    print('Usage: extract_blocks_json.py <markdown-file>')
    sys.exit(1)

file = sys.argv[1]
with open(file, 'r', encoding='utf8') as f:
    content = f.read()

blocks = extract_stat_blocks(content)
print(json.dumps(blocks, indent=2))
