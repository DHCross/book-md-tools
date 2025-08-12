import re, sys, json, pathlib

def load_text(p):
    return pathlib.Path(p).read_text(encoding='utf-8', errors='ignore')

def extract_toc(text):
    # TOC lines like: [Title]()
    return [m.group(1).strip() for m in re.finditer(r'^\[(.+?)\]\(\)', text, re.M)]

def extract_headings(text):
    return [m.group(2).strip() for m in re.finditer(r'^(#{1,6})\s+(.+)$', text, re.M)]

def normalize(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.replace('\u00a0', ' ')  # no-break space
    return s

def main(path):
    txt = load_text(path)
    toc = list(map(normalize, extract_toc(txt)))
    heads = list(map(normalize, extract_headings(txt)))

    missing = [t for t in toc if t not in heads]
    extra = [h for h in heads if h not in toc and any(h.startswith(t.split(' [')[0]) for t in toc)]
    seq_toc = [t for t in toc if t in heads]
    doc_seq = [h for h in heads if h in seq_toc]
    order_mismatch = (seq_toc != doc_seq)

    # Simple appendix numbering sanity check
    appendix_toc = [t for t in toc if t.lower().startswith("appendix")]
    numbering_warn = False
    nums = []
    for t in appendix_toc:
        m = re.search(r'appendix\s+([A-Z])\b', t, re.I)
        if m: nums.append(m.group(1))
    if nums and nums != sorted(nums):
        numbering_warn = True

    report = {
        "toc_entries": len(toc),
        "heading_entries": len(heads),
        "missing_in_document": missing,
        "present_in_document_but_not_in_toc_preview": extra[:25],
        "order_mismatch": order_mismatch,
        "appendix_numbering_warn": numbering_warn
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python tools/toc_vs_headings.py <file.md>")
        sys.exit(1)
    main(sys.argv[1])
