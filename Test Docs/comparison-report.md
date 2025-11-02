# Document Comparison Report

**Baseline Document:** `test_doc1_complete.md`  
**Comparison Document:** `test_doc2_incomplete.md`  
**Total Issues Found:** 25  

## Critical Issues (4)

### 1. Content Volume
**Description:** Large lines count difference: Doc1=59, Doc2=34 (42.4% deviation)  
**Details:** `{'metric': 'lines', 'doc1': 59, 'doc2': 34, 'deviation': 0.423728813559322}`  

### 2. Content Volume
**Description:** Large words count difference: Doc1=273, Doc2=137 (49.8% deviation)  
**Details:** `{'metric': 'words', 'doc1': 273, 'doc2': 137, 'deviation': 0.4981684981684982}`  

### 3. Content Volume
**Description:** Large paragraphs count difference: Doc1=24, Doc2=15 (37.5% deviation)  
**Details:** `{'metric': 'paragraphs', 'doc1': 24, 'doc2': 15, 'deviation': 0.375}`  

### 4. Content Volume
**Description:** Large characters count difference: Doc1=1772, Doc2=847 (52.2% deviation)  
**Details:** `{'metric': 'characters', 'doc1': 1772, 'doc2': 847, 'deviation': 0.5220090293453724}`  

## Major Issues (14)

### 1. Symmetry & Sequence
**Description:** Part 2 present in baseline but missing in comparison document  
**Location (Doc1):** Line 11  
**Location (Doc2):** Not found  
**Details:** `{'sequence': 2, 'type': 'Part'}`  

### 2. Symmetry & Sequence
**Description:** Chapter 4 present in baseline but missing in comparison document  
**Location (Doc1):** Line 3  
**Location (Doc2):** Not found  
**Details:** `{'sequence': 4, 'type': 'Chapter'}`  

### 3. Symmetry & Sequence
**Description:** Section 4.1 present in baseline but missing in comparison document  
**Location (Doc1):** Line 41  
**Location (Doc2):** Not found  
**Details:** `{'sequence': '4.1', 'type': 'Section'}`  

### 4. Symmetry & Sequence
**Description:** Section 4.2 present in baseline but missing in comparison document  
**Location (Doc1):** Line 41  
**Location (Doc2):** Not found  
**Details:** `{'sequence': '4.2', 'type': 'Section'}`  

### 5. Symmetry & Sequence
**Description:** Appendix B present in baseline but missing in comparison document  
**Location (Doc1):** Line 49  
**Location (Doc2):** Not found  
**Details:** `{'sequence': 'B', 'type': 'Appendix'}`  

### 6. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Chapter IV: Modern Era'  
**Details:** `{'heading': 'Chapter IV: Modern Era'}`  

### 7. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Section 4.2: Information Age'  
**Details:** `{'heading': 'Section 4.2: Information Age'}`  

### 8. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Part 2: Late Period'  
**Details:** `{'heading': 'Part 2: Late Period'}`  

### 9. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Appendix B: References'  
**Details:** `{'heading': 'Appendix B: References'}`  

### 10. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Section 4.1: Industrial Revolution'  
**Details:** `{'heading': 'Section 4.1: Industrial Revolution'}`  

### 11. Content Volume
**Description:** Section present in Doc1 but missing in Doc2: 'Test Document 1 - Complete Version'  
**Details:** `{'heading': 'Test Document 1 - Complete Version'}`  

### 12. Content Volume
**Description:** Section 'Chapter III: Renaissance' has significant size difference: Doc1=5 lines, Doc2=3 lines (40.0% deviation)  
**Location (Doc1):** Line 31  
**Location (Doc2):** Line 19  
**Details:** `{'heading': 'Chapter III: Renaissance', 'doc1_lines': 5, 'doc2_lines': 3, 'deviation': 0.4}`  

### 13. Content Volume
**Description:** Section 'Appendix A: Glossary' has significant size difference: Doc1=5 lines, Doc2=3 lines (40.0% deviation)  
**Location (Doc1):** Line 49  
**Location (Doc2):** Line 31  
**Details:** `{'heading': 'Appendix A: Glossary', 'doc1_lines': 5, 'doc2_lines': 3, 'deviation': 0.4}`  

### 14. Content Volume
**Description:** Section 'Chapter I: Introduction' has significant size difference: Doc1=5 lines, Doc2=3 lines (40.0% deviation)  
**Location (Doc1):** Line 3  
**Location (Doc2):** Line 3  
**Details:** `{'heading': 'Chapter I: Introduction', 'doc1_lines': 5, 'doc2_lines': 3, 'deviation': 0.4}`  

## Moderate Issues (7)

### 1. Symmetry & Sequence
**Description:** Gap detected in Chapter sequence in Doc2: missing [4]  
**Details:** `{'gap': [4], 'type': 'Chapter', 'document': 'Doc2'}`  

### 2. Structural Parity
**Description:** Invalid or missing separator line in Doc1 table  
**Location (Doc1):** Line 16  

### 3. Structural Parity
**Description:** Invalid or missing separator line in Doc1 table  
**Location (Doc1):** Line 26  

### 4. Structural Parity
**Description:** Invalid or missing separator line in Doc2 table  
**Location (Doc2):** Line 14  

### 5. Content Volume
**Description:** Section present in Doc2 but not in Doc1: 'Section 5.1: Digital Age'  
**Details:** `{'heading': 'Section 5.1: Digital Age'}`  

### 6. Content Volume
**Description:** Section present in Doc2 but not in Doc1: 'Chapter V: Contemporary Period'  
**Details:** `{'heading': 'Chapter V: Contemporary Period'}`  

### 7. Content Volume
**Description:** Section present in Doc2 but not in Doc1: 'Test Document 2 - Incomplete Version'  
**Details:** `{'heading': 'Test Document 2 - Incomplete Version'}`  

## Summary by Check Type

| Check Type | Issue Count |
|------------|-------------|
| Content Volume | 16 |
| Structural Parity | 3 |
| Symmetry & Sequence | 6 |