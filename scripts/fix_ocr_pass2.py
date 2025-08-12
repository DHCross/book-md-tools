import re, sys, json, pathlib
from collections import Counter

# ---- Load typo map from JSON if present, else use inline seed ----
SEED_TYPO_MAP = {
    "neccessairly":"necessarily", "necessairly":"necessarily",
    "tendancy":"tendency", "assocated":"associated",
    "Ygesburgh":"Yggsburgh", "Ygghsburgh":"Yggsburgh", "Yggsbrugh":"Yggsburgh",
    "Yggsburghs":"Yggsburgh’s",
    "Layont":"Layout", "conrse":"course", "surronnd":"surround",
    "surronnding":"surrounding", "throngh":"through", "onnce":"ounce",
    "previonsly":"previously", "enongh":"enough", "fonrth":"fourth",
    "gatehonse":"gatehouse", "gatehonses":"gatehouses",
    "Marvel Playhonse":"Marvel Playhouse",
    "Dark Chateu":"Dark Chateau", "non-playe r":"non-player"
}

def load_typo_map():
    p = pathlib.Path("scripts/typos.json")
    if p.exists():
        return json.loads(p.read_text())
    return SEED_TYPO_MAP

def case_preserve(src: str, repl: str) -> str:
    """Preserve capitalization pattern of src in replacement."""
    if src.isupper(): return repl.upper()
    if src[0].isupper(): return repl[0].upper() + repl[1:]
    return repl

def apply_typos(text: str, typo_map: dict, stats: Counter) -> str:
    for wrong, right in typo_map.items():
        # whole-word replace; allow punctuation boundaries
        pattern = re.compile(rf'(?<!\w){re.escape(wrong)}(?!\w)')
        def _sub(m):
            stats[f"typo:{wrong}→{right}"] += 1
            return case_preserve(m.group(0), right)
        text = pattern.sub(_sub, text)
    return text

def fix_word_breaks(text: str, stats: Counter) -> str:
    # 1) hyphen linebreak joins
    n1 = len(re.findall(r'(?<=\w)-\s*\n\s*(?=\w)', text))
    text = re.sub(r'(?<=\w)-\s*\n\s*(?=\w)', '', text)
    stats["joined_hyphen_linebreaks"] += n1

    # 2) accidental newline within final 1–3 letters
    n2 = len(re.findall(r'(?<=\w)\s*\n\s*(?=[a-z]{1,3}\b)', text))
    text = re.sub(r'(?<=\w)\s*\n\s*(?=[a-z]{1,3}\b)', '', text)
    stats["joined_short_suffix_linebreaks"] += n2

    # 3) stray single space before 1–3 letter suffix (playe r)
    n3 = len(re.findall(r'(?<=\w) (?=[a-z]{1,3}\b)', text))
    text = re.sub(r'(?<=\w) (?=[a-z]{1,3}\b)', '', text)
    stats["joined_short_suffix_spaces"] += n3

    return text

def fix_punct_spacing(text: str, stats: Counter) -> str:
    pat = re.compile(r'(?<!\b[A-Z])([.!?])(?!\s|["\')\]])(?=[A-Za-z])')
    n = len(pat.findall(text))
    text = pat.sub(lambda m: m.group(1) + ' ', text)
    stats["added_space_after_punct"] += n
    return text

def normalize_dashes(text: str, stats: Counter) -> str:
    # normalize triple hyphens first
    n0 = len(re.findall(r'\s*---\s*', text))
    text = re.sub(r'\s*---\s*', ' — ', text)
    stats["dash_triple_to_em"] += n0

    # convert double hyphen or spaced em to ' — '
    n1 = len(re.findall(r'\s*--\s*|\s*—\s*', text))
    text = re.sub(r'\s*--\s*|\s*—\s*', ' — ', text)
    stats["dash_norm_em"] += n1

    # collapse multiple spaces around em dash
    text = re.sub(r'\s*—\s*', ' — ', text)
    text = re.sub(r' {2,}', ' ', text)
    return text

def collapse_spaces(text: str, stats: Counter) -> str:
    n = len(re.findall(r'(?<!^) {2,}', text))
    text = re.sub(r'(?<!^) {2,}', ' ', text)
    stats["collapsed_spaces"] += n
    return text

HEADING_FIXES = {
    "Backgronnd": "Background",
    "Overveiw": "Overview",
    "north Citadel Park": "North Citadel Park",
}

def normalize_headings(text: str, stats: Counter) -> str:
    lines = text.splitlines()
    for i,l in enumerate(lines):
        if l.startswith('#'):
            # trim trailing spaces
            new = re.sub(r'\s+$','', l)
            # fix known OCR heading typos
            for wrong,right in HEADING_FIXES.items():
                if wrong in new:
                    new = new.replace(wrong, right)
                    stats[f"heading_fix:{wrong}→{right}"] += 1
            lines[i] = new
    return "\n".join(lines)

def toc_check(text: str) -> dict:
    # crude extractor for TOC bracketed entries: [Title]()
    toc = re.findall(r'^\[(.+?)\]\(\)', text, flags=re.M)
    headings = re.findall(r'^(#{1,6})\s+(.+)$', text, flags=re.M)
    heading_texts = [h[1].strip() for h in headings]

    missing = [t for t in toc if t not in heading_texts]
    extras = [h for h in heading_texts if h in toc]  # present in both
    order_mismatch = False
    seq = [t for t in toc if t in heading_texts]
    if seq:
        # build doc order of those same titles
        doc_seq = [h for h in heading_texts if h in seq]
        order_mismatch = (seq != doc_seq)
    return {"toc_count": len(toc), "headings_count": len(heading_texts),
            "missing_from_doc": missing, "order_mismatch": order_mismatch}

def main(path):
    p = pathlib.Path(path)
    text = p.read_text(encoding='utf-8', errors='ignore')
    stats = Counter()

    typo_map = load_typo_map()

    # Pass order matters; safest sequence below
    text = fix_word_breaks(text, stats)
    text = fix_punct_spacing(text, stats)
    text = normalize_dashes(text, stats)
    text = collapse_spaces(text, stats)
    text = apply_typos(text, typo_map, stats)
    text = normalize_headings(text, stats)

    report = toc_check(text)

    out = p.with_suffix(p.suffix + ".fixed.md")
    out.write_text(text, encoding='utf-8')

    # Print concise report
    print("== OCR Fix Pass 2 Report ==")
    for k,v in stats.items():
        if v:
            print(f"{k}: {v}")
    print("\n== TOC Check ==")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nWrote: {out}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/fix_ocr_pass2.py <path-to-md>")
        sys.exit(1)
    main(sys.argv[1])
