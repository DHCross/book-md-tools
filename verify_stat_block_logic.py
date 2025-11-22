import re

def extract_stat_blocks(content):
    lines = content.split('\n')
    blocks = []

    # State variables
    last_header = None
    last_header_line = -1

    # Keywords that signal a section start but are NOT the name of the block
    # (We generally ignore these when updating 'last_header')
    IGNORE_HEADERS = {'SIEGE', 'ECOLOGY', 'Description'}

    for i, line in enumerate(lines):
        line_num = i + 1
        stripped = line.strip()

        # ---------------------------------------------------------
        # 1. Analyze Line Type
        # ---------------------------------------------------------
        header_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        bold_match = re.match(r'^\*\*(.+)\*\*$', stripped)

        current_line_header = None

        if header_match:
            current_line_header = header_match.group(2).strip()
        elif bold_match:
            current_line_header = bold_match.group(1).strip()

        # ---------------------------------------------------------
        # 2. Detection Logic
        # ---------------------------------------------------------

        # Form 3: Markdown List
        # Trigger: List item starting with * **Type: or * **Level
        if stripped.startswith('* **Type:**') or stripped.startswith('* **Level'):
            # If this list immediately follows a header (within 1-2 lines), it's a stat block
            if last_header and (line_num - last_header_line <= 2):
                # Check duplicates (prevent re-adding same block if multiple list items match)
                if not blocks or blocks[-1]['line'] != last_header_line:
                    blocks.append({
                        'name': last_header,
                        'line': last_header_line,
                        'type': 'Stat Block (List)'
                    })
                continue

        # Form 2: SIEGE
        # Trigger: **SIEGE** section header
        if stripped == '**SIEGE**':
            if last_header:
                blocks.append({
                    'name': last_header,
                    'line': last_header_line,
                    'type': 'Stat Block (SIEGE)'
                })
                continue

        # Form 1: Inline/Paragraph
        # Trigger: "vital stats are" inside text (not just header)
        if 'vital stats are' in line:
            name_match = re.match(r'^([^,(]+)', stripped)
            name = name_match.group(1).strip() if name_match else stripped[:30] + "..."

            blocks.append({
                'name': name,
                'line': line_num,
                'type': 'Stat Block (Inline)'
            })
            continue

        # ---------------------------------------------------------
        # 3. State Update (Post-Detection)
        # ---------------------------------------------------------
        # Only update the "last header" if it's a valid header candidate
        # and NOT one of our section keywords
        if current_line_header:
            # Strip HTML tags if present (basic)
            clean_header = re.sub(r'<[^>]+>', '', current_line_header).strip()

            if clean_header not in IGNORE_HEADERS:
                last_header = clean_header
                last_header_line = line_num

    return blocks

# Run verification
with open('test_inputs/stat_blocks.md', 'r') as f:
    content = f.read()

found = extract_stat_blocks(content)
print(f"Found {len(found)} blocks:")
for b in found:
    print(f"- [{b['type']}] {b['name']} (Line {b['line']})")
