#!/usr/bin/env python3
"""
Pandoc filter: Preserve custom Word tagging (<ch>, <1>, <2>, <3>) into Markdown headings.

Usage (Pandoc):
  pandoc input.docx -t gfm -o output.md \
    --wrap=none --markdown-headings=setext \
    --filter "python3 filters/word_tag_to_markdown_filter.py"

Behavior:
- Lines or paragraphs beginning with tags are converted to headings:
  <ch> -> H1
  <1>  -> H2
  <2>  -> H3
  <3>  -> H4
- Tags are stripped from the content.
- Works for DOCX→MD and HTML→MD flows.
"""
import panflute as pf
import re

tag_map = {
    '<ch>': 1,
    '<1>': 2,
    '<2>': 3,
    '<3>': 4,
}

TAG_RE = re.compile(r'^(<ch>|<1>|<2>|<3>)\s*', re.IGNORECASE)

def para_to_header(elem: pf.Element, doc: pf.Doc):
    if isinstance(elem, pf.Para):
        # extract plain text
        text = pf.stringify(elem).lstrip()
        m = TAG_RE.match(text)
        if m:
            tag = m.group(1).lower()
            level = tag_map.get(tag, None)
            if level:
                # Strip tag and whitespace
                new_text = TAG_RE.sub('', text).lstrip()
                # Build a Header element with the remaining inline content
                return pf.Header(pf.Str(new_text), level=level)
    return None

def main(doc=None):
    return pf.run_filter(para_to_header, doc=doc)

if __name__ == '__main__':
    main()
