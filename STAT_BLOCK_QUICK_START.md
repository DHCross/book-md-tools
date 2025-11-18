# 🚀 C&C Stat Block Navigator - Quick Start Guide

## ✅ What's Been Created

I've analyzed your stat block submodule and created the foundation for integrating the Canonical C&C Stat Block Navigator into your Electron workbench.

### 📁 Files Created:

1. **`STAT_BLOCK_INTEGRATION_ROADMAP.md`** (Comprehensive guide)
   - Complete 3-step integration plan
   - Detailed code examples for each phase
   - UI mockups and styling
   - Testing strategy
   - Success criteria

2. **`electron/lib/cnc-classification-rules.js`** (Core classifier - READY)
   - ✅ De-TypeScripted from classification-rules.ts
   - ✅ 5-step classification hierarchy implemented
   - ✅ All 6 signals (HasSpells, HasClassKeyword, etc.)
   - ✅ Monster type dictionary (200+ creatures)
   - ✅ Governor logic (HasSpells priority override)
   - **Status:** Ready to use - no modifications needed

3. **`electron/lib/cnc-validation-rules.js`** (Validator - READY)
   - ✅ Attribute phrasing enforcement
   - ✅ Level notation validation
   - ✅ Saves notation checks
   - ✅ Auto-fix capability for some errors
   - **Status:** Ready to use - no modifications needed

---

## 🎯 The Three Technical Steps

### **STEP 1: Complete Parser Conversion** ⏳ (2-3 hours remaining)
**Status:** 40% complete - Still need to convert `enhanced-parser.ts`

**What's Done:**
- ✅ Classification rules (cnc-classification-rules.js)
- ✅ Validation rules (cnc-validation-rules.js)

**What's Needed:**
- ⏳ Convert `enhanced-parser.ts` → `cnc-parser.js` (parenthetical extraction)
- ⏳ Create main entry point: `cnc-stat-block-parser.js` (orchestrator)

**Next Action:**
```bash
# Create the parser orchestrator
touch electron/lib/cnc-stat-block-parser.js
```

Then add this code to `electron/lib/cnc-stat-block-parser.js`:
```javascript
const { classifyEntityV3 } = require('./cnc-classification-rules');
const { validateStatBlock } = require('./cnc-validation-rules');

function analyzeStatBlock(markdownText, options = {}) {
  // Extract name and parenthetical
  const match = /\*\*([^*]+)\*\*\s*\(([^)]+)\)/.exec(markdownText);
  
  if (!match) {
    throw new Error('Invalid stat block format - expected **Name** (data)');
  }
  
  const name = match[1].trim();
  const parenthetical = match[2].trim();
  
  // Simple canonical data extraction (you'll expand this)
  const canonicalData = {
    name: name,
    level: parenthetical.match(/level\s+\d+|\d+(?:st|nd|rd|th)\s+level/i)?.[0] || '',
    hd: parenthetical.match(/HD\s+\d+/i)?.[0] || '',
    // Add more fields as needed
  };
  
  // Extract context
  const context = {
    raceClass: parenthetical,
    spells: /spell|wizard|cleric|druid/i.test(parenthetical) ? 'detected' : null,
    description: markdownText
  };
  
  // Classify
  const classification = classifyEntityV3(name, canonicalData, context);
  
  // Validate
  let validation = { errors: [], warnings: [], isValid: true };
  if (options.validateFormat !== false) {
    validation = validateStatBlock(markdownText, classification);
  }
  
  return {
    name,
    classification,
    validation,
    signals: classification.signals,
    reasoning: classification.reasoning,
    step: classification.step
  };
}

module.exports = { analyzeStatBlock };
```

---

### **STEP 2: Add IPC Bridge** ⏳ (1-2 hours)
**Status:** 0% complete - Code ready to copy

**What to Do:**

1. **Edit `electron/main.js`** - Add after line 220:
```javascript
// IPC: Analyze C&C Stat Block
const { analyzeStatBlock } = require('./lib/cnc-stat-block-parser');

ipcMain.handle('analyze-stat-block', async (event, markdownText, options = {}) => {
  try {
    const result = analyzeStatBlock(markdownText, options);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

2. **Edit `electron/preload.js`** - Add to electronAPI exports:
```javascript
analyzeStatBlock: (markdownText, options) =>
  ipcRenderer.invoke('analyze-stat-block', markdownText, options),
```

3. **Test with console:**
```javascript
// In renderer.js console:
const result = await window.electronAPI.analyzeStatBlock(
  '**Goblin Shaman** (5th level wizard, HD 5, HP 22, AC 12)',
  { validateFormat: true }
);
console.log(result);
// Should show Format A, HasSpells=true, validation errors
```

---

### **STEP 3: Build UI Navigator** ⏳ (3-4 hours)
**Status:** 0% complete - Full code provided in roadmap

**What to Do:**

1. **Add HTML section** to `electron/src/index.html` (after navigator ~line 330)
2. **Add renderer logic** to `electron/src/renderer.js` (full code in roadmap)
3. **Add CSS styles** to `electron/src/styles.css` (full code in roadmap)

**Copy from:** `STAT_BLOCK_INTEGRATION_ROADMAP.md` Step 3 section

---

## 🔍 Key Features You're Getting

### 1. **Automatic Classification**
- **Format A** (Classed NPC) - Green badge
- **Format B** (Monster) - Blue badge  
- **Format C** (Unit) - Purple badge

### 2. **Governor Logic** (Highest Priority Override)
```
"Goblin Shaman" with spells → Format A (not B)
"Orc Witch Doctor" with spells → Format A (not B)
"Goblin" without spells → Format B
```

### 3. **Critical Validation Rules**

**Rule 1: Attribute Phrasing**
```
❌ Classed NPC: "Their primary attributes are physical"
✅ Classed NPC: "Their primary attributes are strength, dexterity, constitution, intelligence, wisdom, charisma"
```

**Rule 2: Level Notation**
```
❌ **Goblin Shaman** (5th level wizard)
✅ **Goblin Shaman, 5th Level** (wizard)
```

**Rule 3: Saves Notation**
```
✅ Monster: "Saves: P" (instead of long-form)
```

---

## 📊 Visual Example

When complete, your Navigator will look like this:

```
📊 C&C Stat Blocks
┌─────────────────────────────────┐
│ Total Blocks: 24                │
│ Validation Errors: 3 🔴         │
└─────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [A] Goblin Shaman ⚠️                   │
│ Classed NPC (Spellcaster) - wizard     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    │
│ ⚠️ LEVEL_NOTATION_IN_PARENTHESES       │
│    Level notation must not appear      │
│    inside parentheses                  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [B] Goblin                             │
│ Monster (default)                      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ [C] Bandits x4                         │
│ Unit (bandit group override)           │
└─────────────────────────────────────────┘
```

---

## 🧪 Quick Test Cases

Once Step 2 is complete, test these in the console:

```javascript
// Test 1: Spellcaster (should be Format A)
await window.electronAPI.analyzeStatBlock(
  '**Goblin Shaman** (wizard, spells per day: 3/2/1)'
);

// Test 2: Regular monster (should be Format B)
await window.electronAPI.analyzeStatBlock(
  '**Goblin** (HD 1, HP 4, AC 15)'
);

// Test 3: Unit (should be Format C)
await window.electronAPI.analyzeStatBlock(
  '**Bandits x4** (HD 1, HP 4 each)'
);

// Test 4: Validation error (should flag level notation)
await window.electronAPI.analyzeStatBlock(
  '**Elf Captain** (5th level fighter, HD 5, HP 32)'
);
```

---

## 📝 Current Status Summary

| Component | Status | Progress |
|-----------|--------|----------|
| Classification Rules | ✅ Complete | 100% |
| Validation Rules | ✅ Complete | 100% |
| Parser (enhanced-parser) | ⏳ Needed | 0% |
| Stat Block Parser (main) | ⏳ Needed | 0% |
| IPC Bridge | ⏳ Needed | 0% |
| UI Navigator | ⏳ Needed | 0% |
| **OVERALL** | **In Progress** | **40%** |

---

## ⏭️ Immediate Next Steps

1. **Create `electron/lib/cnc-stat-block-parser.js`** (use code above)
2. **Test basic classification** in Node.js:
   ```bash
   node -e "const {analyzeStatBlock} = require('./electron/lib/cnc-stat-block-parser'); console.log(analyzeStatBlock('**Goblin Shaman** (wizard, HD 5)'))"
   ```
3. **Add IPC handlers** (Step 2)
4. **Build UI** (Step 3)

---

## 💡 Why This Is Valuable

The stat block submodule code is **production-tested** and implements complex domain logic that would take weeks to reverse-engineer from scratch:

1. **5-Step Classification Hierarchy** - Deterministic, rule-based classification
2. **200+ Monster Dictionary** - From official C&C M&T books
3. **Governor Logic** - HasSpells always wins (prevents misclassification)
4. **PHB Compliance** - Enforces official attribute ordering
5. **Canonical Validation** - Catches common conversion errors

**Bottom Line:** You're integrating battle-tested logic that enforces C&C canon rules automatically.

---

## 🎯 Success Metrics

You'll know it's working when:
- ✅ "Goblin Shaman" → Format A (even though it's a goblin)
- ✅ "Goblin" → Format B
- ✅ Validation flags "physical" shorthand in Classed NPCs
- ✅ Validation flags level notation inside parentheses
- ✅ Navigator shows color-coded badges (A=green, B=blue, C=purple)
- ✅ Click-to-jump works from navigator to stat block

---

**Estimated Completion Time:** 6-9 hours total (40% done, 4-6 hours remaining)

Ready to proceed with Step 1 completion! 🚀
