# **C\&C Monster Stat Block Templates**

# C\&C Monster Stat Block Templates

This document provides three template formats for creating Castles & Crusades monsters, from the classic table format to the newer inline style used in C\&C Reforged.

---

## **Template 1: Classic Table Format**

This matches the traditional *Monsters & Treasure* structure with a two-column stat table followed by description and abilities.

---

# **MONSTER NAME**, *TYPE*

| SIEGE |  | ECOLOGY |  |
| :---- | :---- | :---- | :---- |
| **Level:** |  | **Number:** |  |
| **AC:** |  | **Size:** |  |
| **Saves:** |  | **Intelligence:** |  |
| **Move:** |  | **Disposition:** |  |
| **Sanity:** |  | **Climate:** |  |
| **Attacks:** |  | **Biome:** |  |
| **XP:** |  | **Treasure:** |  |
| **Abilities:** |  |  |  |

### **Description**

*Appearance, ecology, behavior, motivations, social structure, lairs, sensory abilities, movement modes, typical tactics, etc.*

### **Abilities**

*List and explain special attacks, defenses, resistances, immunities, spell-like abilities, aura effects, etc.*

---

## **Template 2: Bulleted List Format**

This uses the same information as the table version but in a simpler bulleted layout.

---

# **MONSTER NAME**, *Type*

### **SIEGE**

- **Level:**  
- **HP:**  
- **AC:**  
- **Saves:**  
- **Move:**  
- **Sanity:**  
- **Attacks:**  
- **XP:**  
- **Abilities:**

### **ECOLOGY**

- **Number:**  
- **Size:**  
- **Intelligence:**  
- **Disposition:**  
- **Climate:**  
- **Biome:**  
- **Treasure:**

### **Description**

*Appearance, ecology, behavior, motivations, social structure, lairs, sensory abilities, movement modes, typical tactics, etc.*

### **Abilities**

*List and explain special attacks, defenses, resistances, immunities, spell-like abilities, aura effects, etc.*

---

## **Template 3: C\&C Reforged Inline Format**

This is the official conversion style for C\&C Reforged. The stat block appears as an italicized paragraph immediately after the creature name.

**Key formatting rules:**

- Stats appear inline as one italicized paragraph  
- Use **Level X(dX)** notation  
- **Disposition** uses noun forms (e.g., "hostile" not "hostility")  
- **Magic item names** are italicized  
- **Bold** any reference to level outside the parenthetical  
- Use **superscripts** for level mentions in prose

---

# **MONSTER NAME**, *type*

*(This creature's vital stats are Level X(dX), HP \#, AC \#, SR \# (if applicable), Saves \#, Move \#, Sanity \#, attacks \# for \# damage, XP \#, and treasure \#. Its size is \#, number appearing \#, intelligence \#, disposition \#, climate \#, biome \#, and it possesses the following abilities: \[list abilities\].)*

### **Description**

*Clear prose explaining appearance, habitat, behavior, ecology, motivations, tactics, and lair information.*

### **Abilities**

**Ability Name:** Description of effect, mechanics, save type if any, damage, intervals, and CK-facing details.

**Ability Name:** Description of effect, mechanics, save type if any, damage, intervals, and CK-facing details.

---

## **Optional: Creature-Type Introduction Block**

Use this when presenting multiple creatures from the same family (Giants, Dragons, Hags, Undead, etc.).

---

## **\[CREATURE TYPE NAME\] Overview**

*General notes, shared traits, behavior, cosmology, and any universal mechanics.*

### **Shared Traits**

| Trait | Description |
| :---- | :---- |
| Trait Name | Explanation of shared ability or characteristic |
| Trait Name | Explanation of shared ability or characteristic |

## **Quick Reference: Which Template to Use**

- **Classic Table Format**: Best for traditional C\&C products and when you want clear visual separation of stats  
- **Bulleted List Format**: Good for quick reference and digital documents where tables don't render well  
- **Reforged Inline Format**: Required for official C\&C Reforged content; more compact and narrative-friendly

# **Tab-Delimited Format**

# Converting Monster Stats to Tab-Delimited Format

This guide explains how to prepare monster stat blocks as tab-delimited data for layout software, particularly for InDesign and Affinity Publisher workflows.

---

## **What is Tab-Delimited Data?**

Tab-delimited data uses specific control characters to structure table content:

- **Tab character** (shows as `▸` in most editors): Separates columns  
- **Return/Paragraph character** (shows as `¶`): Separates rows

This format allows layout software to automatically convert structured text into proper table objects.

---

## **Converting the Classic Table Format**

### **Original Markdown Table**

| SIEGE |  | ECOLOGY |  |

| :---- | :---- | :---- | :---- |

| \*\*Level:\*\* |  | \*\*Number:\*\* |  |

| \*\*AC:\*\* |  | \*\*Size:\*\* |  |

### **Tab-Delimited Version**

SIEGE		ECOLOGY

Level:	\[value\]	Number:	\[value\]

AC:	\[value\]	Size:	\[value\]

Saves:	\[value\]	Intelligence:	\[value\]

Move:	\[value\]	Disposition:	\[value\]

Sanity:	\[value\]	Climate:	\[value\]

Attacks:	\[value\]	Biome:	\[value\]

XP:	\[value\]	Treasure:	\[value\]

Abilities:	\[value\]		

**Key points:**

- Each 	 represents one TAB character  
- Each line break represents one RETURN  
- Four columns total: Label, Value, Label, Value  
- Empty cells still need tabs to maintain column structure

---

## **Workflow by Software**

### **InDesign (Recommended for Tab-Delimited)**

1. Prepare your data in a plain text editor with tabs between columns and returns between rows  
2. Copy the tab-delimited text  
3. Paste into InDesign text frame  
4. Select the pasted text  
5. Go to **Table \> Convert Text to Table**  
6. Set **Column Separator** to "Tab"  
7. Set **Row Separator** to "Paragraph"  
8. Click OK

Result: A fully editable table object that can be styled with table styles.

### **Affinity Publisher (Requires Different Approach)**

Publisher doesn't have robust automatic conversion from tab-delimited text. Instead:

**Method 1: Create Table First**

1. Use the **Table Tool** to create a table with the correct dimensions (4 columns × 8 rows for the classic format)  
2. Prepare your data in Excel or another spreadsheet  
3. Copy the data (with tabs between columns)  
4. Select the first cell in your Publisher table  
5. Paste the data—it will flow into the existing table structure

**Method 2: Import from Excel/Spreadsheet**

1. Prepare your stat block in Excel or Google Sheets  
2. Save as .TSV (Tab-Separated Values) or copy directly  
3. Create a table in Publisher with matching dimensions  
4. Paste into the first cell

**Warning:** Don't paste tab-delimited text into Publisher without first creating a table—you'll get individual text frames instead of a table object.

---

## **Template-Specific Conversion**

### **Two-Column SIEGE/ECOLOGY Table**

**Dimensions:** 4 columns × 8 rows (or 9 if including header)

**Structure:**

Column 1: SIEGE labels

Column 2: SIEGE values

Column 3: ECOLOGY labels  

Column 4: ECOLOGY values

**Sample tab-delimited format:**

Level:	5(d10)	Number:	1d4

AC:	18	Size:	Large

Saves:	\+6	Intelligence:	High

Move:	30ft	Disposition:	Hostile

Sanity:	\-2	Climate:	Any

Attacks:	2 claws \+8 (1d8+4)	Biome:	Underground

XP:	600	Treasure:	Standard

Abilities:	See below		

### **Shared Traits Table**

**Dimensions:** 2 columns × varies by number of traits

**Structure:**

Trait Name	Description

Trait Name	Description

**Sample:**

Darkvision	Can see in darkness up to 60 feet

Regeneration	Regains 5 HP per round unless damaged by fire

Magic Resistance	Advantage on saves against spells

---

## **Best Practices**

### **Before Conversion**

1. **Use a plain text editor** that shows invisible characters (like Sublime Text, VS Code, or BBEdit)  
2. **Verify tab placement** by enabling "Show Invisibles"—you should see `▸` for tabs  
3. **Check for consistency**—each row should have the same number of tabs  
4. **Test with a small sample** before converting your entire document

### **During Conversion**

1. **Start with correct dimensions** in Affinity Publisher (create the table first)  
2. **Copy only the data rows** if your receiving table already has headers  
3. **Paste into the first data cell**, not the header row  
4. **Check alignment immediately**—misaligned data means tab count was wrong

### **After Conversion**

1. **Apply table styles** for borders, fills, and text formatting  
2. **Adjust column widths** to match your layout grid  
3. **Check for text overflow** in cells with long ability lists  
4. **Consider splitting** very wide tables across multiple text frames

---

## **Common Issues and Fixes**

**Problem:** Pasting creates multiple text frames instead of filling table  
**Fix:** You didn't select a table cell first. Create the table, click the first cell, then paste.

**Problem:** Data doesn't align properly in columns  
**Fix:** Inconsistent tab counts. Go back to source data and ensure every row has the same number of tabs.

**Problem:** Header row gets data pasted into it  
**Fix:** Select the first cell of the first *data* row (row 2\) before pasting, not the header.

**Problem:** Empty cells show as merged or missing  
**Fix:** Empty cells still need tabs. Between "Abilities:" and the ECOLOGY column, you need TWO tabs (one for the value cell, one to move to the next column).

---

## **Export Tips**

### **From Scrivener**

- Outliner contents can be exported as Tab-Separated Values (.tsv)  
- Word frequency lists export as tab-delimited text  
- Copy directly from Scrivener and paste into Excel/Sheets for cleanup before importing to layout

### **From Excel/Google Sheets**

- Always copy, never export to CSV (commas cause problems with ability descriptions)  
- Use "Save As" → Tab-Separated Values (.tsv) for archival  
- Test paste into a small table before committing to your full layout

### **From Markdown**

- Markdown tables need manual conversion—there's no automatic tool  
- Copy the table content (without pipes `|`)  
- Replace spaces between columns with single tabs in a text editor  
- Use find-and-replace: search for `\|` (space-pipe-space), replace with tab character

---

## **Quick Reference: Tab Counts**

For the classic SIEGE/ECOLOGY format:

- **Header row:** `SIEGE` \+ 2 tabs \+ `ECOLOGY`  
- **Data rows:** `Label:` \+ 1 tab \+ `Value` \+ 1 tab \+ `Label:` \+ 1 tab \+ `Value`  
- **Last row (Abilities):** `Abilities:` \+ 1 tab \+ `Value` \+ 2 tabs (empty columns)

**Total tabs per data row:** 3  
**Total columns:** 4  
**Total rows (with header):** 9

