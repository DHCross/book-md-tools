import re
from typing import Dict, List, Optional, Any


FIELD_ALIASES = [
    {"field": "HD", "patterns": [r"HD", r"Hit Dice"]},
    {"field": "Level", "patterns": [r"Level"]},
    {"field": "AC", "patterns": [r"AC", r"Armor Class"]},
    {"field": "HP", "patterns": [r"HP", r"Hit Points"]},
    {"field": "Move", "patterns": [r"Move", r"Movement", r"Speed", r"MV"]},
    {"field": "Attacks", "patterns": [r"Attacks", r"Attack", r"#AT"], "multiline": True},
    {"field": "Saves", "patterns": [r"Saves", r"Save"]},
    {"field": "Special", "patterns": [r"Special", r"Special Abilities", r"SA", r"SQ"], "multiline": True},
    {"field": "Int", "patterns": [r"Intelligence", r"Int"]},
    {"field": "Size", "patterns": [r"Size"]},
    {"field": "Align", "patterns": [r"Alignment", r"Disposition"]},
    {"field": "Treasure", "patterns": [r"Treasure"]},
    {"field": "XP", "patterns": [r"XP", r"Experience"]},
    {"field": "Number", "patterns": [r"Number", r"No\. Appearing", r"Number Appearing"]},
]


_MULTILINE_FIELDS = {cfg["field"] for cfg in FIELD_ALIASES if cfg.get("multiline")}

# Expanded inline pattern to catch various stat block formats:
# - Standard: (Level/HD ... HP ... AC ...)
# - Creature syntax: (This creature's vital stats are ...)
# - Level-first: (He is a 3rd level ...) or (4th level, chaotic neutral ...)
# - Direct HP: (HP 20, AC 18, MV ...)
_INLINE_PAREN_PATTERN = re.compile(
    r"\(([^)]*?(?:Level|HD|vital stats are|\d+(?:st|nd|rd|th)\s+level|He is a|She is a|It is a)[^)]*?(?:HP|AC)[^)]*?)\)",
    re.IGNORECASE
)

_INLINE_FIELD_PATTERNS = {
    "Level": re.compile(r"\b(?:Level|He is a|She is a|It is a)\s+(\d+(?:st|nd|rd|th)\s+level|\d+)"),
    "HD": re.compile(r"\bHD\s+([^,]+)"),
    "HP": re.compile(r"\b(?:HP|Hit Points)\s+(\d+)"),
    "AC": re.compile(r"\bAC\s+(\d+)"),
    "Move": re.compile(r"\b(?:Move|MV)\s+([^,]+)"),
    "XP": re.compile(r"\bXP\s+(\d+)"),
}


def _match_field_line(line: str) -> Optional[Dict[str, Any]]:
    """Try to match a classic-format field line and return its canonical field and value."""
    stripped = line.strip()
    if not stripped:
        return None

    for cfg in FIELD_ALIASES:
        for pattern in cfg["patterns"]:
            regex = rf"^\s*(?:[-*\u2022]\s*)?(?:{pattern})[:.]?\s*(.*)$"
            m = re.match(regex, stripped, flags=re.IGNORECASE)
            if m:
                value = m.group(1).strip()
                return {"field": cfg["field"], "value": value}
    return None


def parse_classic_stat_block(lines: List[str]) -> Optional[Dict[str, str]]:
    """Parse a classic/bulleted stat block from the given lines.

    Returns a dict of canonical field -> value if at least 3 unique fields are found,
    otherwise returns None.
    """
    stats: Dict[str, str] = {}
    current_multiline: Optional[str] = None

    for raw_line in lines:
        line = raw_line.rstrip("\n")
        if not line.strip():
            current_multiline = None
            continue

        match = _match_field_line(line)
        if match:
            field = match["field"]
            value = match["value"]

            if field in stats and field in _MULTILINE_FIELDS:
                if value:
                    stats[field] = f"{stats[field]} {value}".strip()
            else:
                stats[field] = value

            current_multiline = field if field in _MULTILINE_FIELDS else None
            continue

        if current_multiline:
            continuation = line.strip()
            continuation = re.sub(r"^[-*\u2022]\s*", "", continuation)
            if continuation:
                existing = stats.get(current_multiline, "")
                if existing:
                    stats[current_multiline] = f"{existing} {continuation}".strip()
                else:
                    stats[current_multiline] = continuation

    if len(stats) >= 3:
        return stats
    return None


def extract_inline_stats(text: str) -> Optional[Dict[str, str]]:
    """Extract inline (Reforged) stats from a single block of text.

    Looks for a parenthetical that contains Level/HD and HP/AC, then pulls
    individual fields from inside that parenthetical.
    """
    m = _INLINE_PAREN_PATTERN.search(text)
    if not m:
        return None

    inner = m.group(1)
    stats: Dict[str, str] = {}
    for field, pattern in _INLINE_FIELD_PATTERNS.items():
        mm = pattern.search(inner)
        if mm:
            stats[field] = mm.group(1).strip()

    if not stats:
        return None
    return stats


def _normalize_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r"^[#>\s]+", "", name)
    name = re.sub(r"^[*_`]+|[*_`]+$", "", name)
    return name.strip()


def extract_stat_blocks(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract both classic and inline stat blocks from the given markdown text.

    Returns a list of dictionaries of the form:
    {"name": str, "format": str, "stats": dict, "raw": str}
    """
    if not markdown_text:
        return []

    blocks: List[Dict[str, Any]] = []
    chunks = re.split(r"\n\s*\n", markdown_text)

    for chunk in chunks:
        text = chunk.strip()
        if not text:
            continue

        inline_stats = extract_inline_stats(text)
        if inline_stats:
            m = _INLINE_PAREN_PATTERN.search(text)
            name_part = text[: m.start()] if m else text
            name_line = name_part.strip().splitlines()[-1] if name_part.strip() else ""
            name = _normalize_name(name_line)
            blocks.append(
                {
                    "name": name,
                    "format": "inline",
                    "stats": inline_stats,
                    "raw": text,
                }
            )
            continue

        lines = text.splitlines()
        name_line: Optional[str] = None
        start_index = 0
        for idx, line in enumerate(lines):
            if line.strip():
                name_line = line
                start_index = idx + 1
                break

        if name_line is None or start_index >= len(lines):
            continue

        stats = parse_classic_stat_block(lines[start_index:])
        if stats:
            name = _normalize_name(name_line)
            blocks.append(
                {
                    "name": name,
                    "format": "classic",
                    "stats": stats,
                    "raw": text,
                }
            )

    return blocks

