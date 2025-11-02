# Lessons Learned: AI Parsing Caveats for Large Tagged Manuscripts

## Context
- Source files (Word, PDF, Markdown) display the full manuscript correctly.
- ChatGPT and similar AIs may not process the entire file, even if the file is complete and readable in standard editors.

## Observed Issue
- When uploading a large, richly-tagged document (e.g., with <1>, <2>, <3> tags), the AI's ingestion pipeline may misinterpret these as structural delimiters (like HTML/XML).
- The parser may stop reading new sections after a false positive, resulting in only a partial document being processed (e.g., up to Chapter Four).
- The file itself is not truncated; the AI simply refuses to show or process the remainder for safety reasons.

## Workarounds
1. **Plain-text normalization:**
   - Export the Word or PDF file as "Plain Text (.txt)" (UTF-8 encoding).
   - This strips hidden XML/field data and preserves literal tags.
   - Uploading this version allows the AI to scan the entire document.
2. **Sectional analysis:**
   - Split the DOCX or PDF into smaller chunks (e.g., Chapters 1–3, 4–6, 7–end).
   - Upload each section separately; the parser will process each independently, avoiding cumulative tag density issues.

## Recommendation
- If you encounter partial reads or missing content in AI tools, try plain-text export first.
- If issues persist, split the document into smaller sections for upload.

---

*This caveat applies to AI tools that parse documents with custom tags or complex field codes. The original files remain intact and complete; the limitation is in the AI's ingestion layer, not your source material.*
