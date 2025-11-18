# 🎯 C&C Stat Block Navigator Integration Roadmap

**Feature:** Canonical C&C Stat Block Navigator and Validator  
**Source:** Production-tested TypeScript modules from `stat block submodule/`  
**Target:** Electron Book MD Workbench

---

## 📋 Executive Summary

The stat block submodule contains **production-ready core logic** for:
- **Domain Classification:** Automatic detection of Classed NPC (Format A) vs Monster (Format B) vs Unit (Format C)
- **Canonical Validation:** Enforcement of PHB attribute ordering, level notation rules, and Saves notation
- **Governor Logic:** HasSpells priority override (e.g., "Goblin Shaman" → always Classed NPC)

**Core Value:** The existing TypeScript modules implement the complete 5-step classification hierarchy and validation rules mandated by the official C&C Rule-Tree documents.

---

## 🚀 Three Technical Steps for Integration

### **STEP 1: Core Adaptation - Create Node.js Parser Module**
**Goal:** Convert TypeScript modules to Node.js-compatible JavaScript  
**Duration:** 2-3 hours  
**Complexity:** Medium (Type removal, ES6 module conversion)

#### Actions:
1. **Strip TypeScript annotations** from all 4 source files
2. **Convert to CommonJS** (for Electron compatibility)
3. **Create standalone parser module** at `electron/lib/cnc-stat-block-parser.js`
4. **Preserve all validation logic** (attribute phrasing, level notation checks)

#### Source Files Used:
- `classification-rules.ts` → Core 5-step hierarchy
- `enhanced-parser.ts` → Parenthetical extraction & validation
- `stat-block-helpers.ts` → Helper functions
- `DocumentAnalyzer.tsx` → UI patterns (reference only)

#### Key Functions to Preserve:
```javascript
// From classification-rules.ts
- extractSignals(creatureName, canonicalData, context)
- classifyEntityV3(creatureName, canonicalData, context)
- MONSTER_TYPE_DICTIONARY (complete bestiary reference)
- CLASS_KEYWORDS, RANK_TITLES, HUMANOID_RACES

// From enhanced-parser.ts
- parseParentheticalData(text)
- expandShorthandForClassed(text)
- normalizeUnicodeSuperscripts(text)

// From stat-block-helpers.ts
- isRankedNamedEntity(title, data)
- determinePossessivePronoun(...)
- buildSubjectDescriptor(options)
```

#### Output File Structure:
```
electron/
  lib/
    cnc-stat-block-parser.js       (Core parser - 500-800 lines)
    cnc-classification-rules.js    (Classification logic - 400-600 lines)
    cnc-validation-rules.js        (Validation enforcement - 200-300 lines)
```

---

### **STEP 2: IPC Bridge - Connect Parser to Electron**
**Goal:** Create IPC handler for UI-to-parser communication  
**Duration:** 1-2 hours  
**Complexity:** Low (Standard Electron IPC pattern)

#### Actions:
1. **Add IPC handler** to `electron/main.js`
2. **Expose API** in `electron/preload.js`
3. **Create validation pipeline** that returns structured results

#### Implementation in `electron/main.js`:

```javascript
// Add after existing IPC handlers (around line 220)

// IPC: Analyze C&C Stat Block
const { analyzeStatBlock } = require('./lib/cnc-stat-block-parser');

ipcMain.handle('analyze-stat-block', async (event, markdownText, options = {}) => {
  try {
    const result = analyzeStatBlock(markdownText, {
      validateFormat: options.validateFormat ?? true,
      checkAttributePhrasing: options.checkAttributePhrasing ?? true,
      checkLevelNotation: options.checkLevelNotation ?? true
    });
    
    return {
      success: true,
      classification: result.classification,    // Format A/B/C
      signals: result.signals,                  // HasSpells, HasClassKeyword, etc.
      validation: result.validation,            // Error array
      reasoning: result.reasoning,              // Human-readable explanation
      step: result.step                         // Which hierarchy step (1-5)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});
```

#### Implementation in `electron/preload.js`:

```javascript
// Add to contextBridge.exposeInMainWorld('electronAPI', { ... })

analyzeStatBlock: (markdownText, options) =>
  ipcRenderer.invoke('analyze-stat-block', markdownText, options),
```

#### Validation Result Structure:
```javascript
{
  success: true,
  classification: {
    format: 'A',              // 'A' = Classed NPC, 'B' = Monster, 'C' = Unit
    category: 'Classed NPC',
    subtype: 'spellcaster',
    confidence: 'high'
  },
  signals: {
    HasSpells: true,
    HasClassKeyword: true,
    HasRankTitle: false,
    IsNamed: true,
    IsUnit: false,
    IsHumanoid: true,
    detectedClassName: 'wizard',
    detectedRace: 'elf'
  },
  validation: {
    errors: [
      {
        type: 'ATTRIBUTE_PHRASING',
        severity: 'error',
        message: 'Classed NPC must use long-form attributes (strength, dexterity, constitution, intelligence, wisdom, charisma)',
        location: 'parenthetical',
        detected: 'Their primary attributes are physical',
        expected: 'Their primary attributes are strength, dexterity, constitution, intelligence, wisdom, charisma'
      },
      {
        type: 'LEVEL_NOTATION_IN_PARENTHESES',
        severity: 'error',
        message: 'Level notation (5th) must not appear inside parentheses',
        location: 'parenthetical',
        detected: '(5th level wizard)',
        fix: 'Move level notation outside parentheses or remove ordinal suffix'
      }
    ],
    warnings: []
  },
  reasoning: 'Classed NPC (Spellcaster - highest priority override) - wizard',
  step: 1
}
```

---

### **STEP 3: UI Integration - Navigator Sidebar & Validation Display**
**Goal:** Display classification and validation results in the UI  
**Duration:** 3-4 hours  
**Complexity:** Medium (New UI components, styling)

#### Actions:
1. **Add Stat Block Navigator** to right sidebar (after document navigator)
2. **Display classification category** with visual indicators
3. **Show validation errors** with red badges
4. **Implement quick-fix suggestions**

#### UI Component Location:
Add to `electron/src/index.html` after Navigator section (around line 330):

```html
<!-- Stat Block Navigator -->
<aside class="stat-block-navigator">
  <h3>📊 C&C Stat Blocks</h3>
  
  <!-- Summary Stats -->
  <div id="statBlockSummary" class="stat-summary">
    <div class="stat-item">
      <span class="label">Total Blocks:</span>
      <span id="totalBlocks" class="value">0</span>
    </div>
    <div class="stat-item">
      <span class="label">Validation Errors:</span>
      <span id="totalErrors" class="value error-badge">0</span>
    </div>
  </div>
  
  <!-- Stat Block List -->
  <div id="statBlockList" class="stat-block-list">
    <!-- Dynamically populated via renderer.js -->
  </div>
</aside>
```

#### Renderer Logic in `electron/src/renderer.js`:

```javascript
// Add after other initialization code (around line 1550)

// ============================================================================
// C&C STAT BLOCK ANALYZER
// ============================================================================

let statBlockData = [];

async function analyzeDocumentStatBlocks() {
  if (!currentContent) return;
  
  // Extract stat blocks from markdown (pattern: **Name** (parenthetical data))
  const statBlockPattern = /\*\*([^*]+)\*\*\s*\(([^)]+)\)/g;
  const blocks = [];
  let match;
  
  while ((match = statBlockPattern.exec(currentContent)) !== null) {
    const name = match[1].trim();
    const parenthetical = match[2].trim();
    const fullText = match[0];
    
    // Call IPC to analyze this stat block
    const result = await window.electronAPI.analyzeStatBlock(fullText, {
      validateFormat: true,
      checkAttributePhrasing: true,
      checkLevelNotation: true
    });
    
    if (result.success) {
      blocks.push({
        name: name,
        fullText: fullText,
        classification: result.classification,
        signals: result.signals,
        validation: result.validation,
        reasoning: result.reasoning,
        lineNumber: getLineNumberFromIndex(match.index)
      });
    }
  }
  
  statBlockData = blocks;
  updateStatBlockUI();
}

function updateStatBlockUI() {
  const listContainer = document.getElementById('statBlockList');
  const totalBlocks = document.getElementById('totalBlocks');
  const totalErrors = document.getElementById('totalErrors');
  
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  
  const errorCount = statBlockData.reduce((sum, block) => 
    sum + (block.validation.errors?.length || 0), 0
  );
  
  totalBlocks.textContent = statBlockData.length;
  totalErrors.textContent = errorCount;
  totalErrors.className = errorCount > 0 ? 'value error-badge' : 'value';
  
  statBlockData.forEach((block, index) => {
    const item = document.createElement('div');
    item.className = 'stat-block-item';
    
    const hasErrors = block.validation.errors?.length > 0;
    if (hasErrors) item.classList.add('has-errors');
    
    // Format indicator: A (green), B (blue), C (purple)
    const formatColor = {
      'A': '#4caf50',
      'B': '#2196f3', 
      'C': '#9c27b0'
    }[block.classification.format] || '#666';
    
    item.innerHTML = `
      <div class="stat-block-header">
        <span class="format-badge" style="background: ${formatColor}">
          ${block.classification.format}
        </span>
        <span class="stat-block-name">${block.name}</span>
        ${hasErrors ? '<span class="error-indicator">⚠️</span>' : ''}
      </div>
      <div class="stat-block-category">${block.reasoning}</div>
      ${hasErrors ? `
        <div class="stat-block-errors">
          ${block.validation.errors.map(err => `
            <div class="error-item">
              <span class="error-type">${err.type}</span>
              <span class="error-msg">${err.message}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    
    // Click to jump to line
    item.addEventListener('click', () => {
      jumpToLine(block.lineNumber);
    });
    
    listContainer.appendChild(item);
  });
}

// Auto-analyze when file loads
const originalLoadFile = loadFile;
loadFile = async function(filePath) {
  await originalLoadFile(filePath);
  await analyzeDocumentStatBlocks();
};
```

#### Styling in `electron/src/styles.css`:

```css
/* Stat Block Navigator */
.stat-block-navigator {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
}

.stat-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.stat-item .label {
  font-weight: 600;
  color: #555;
}

.stat-item .value {
  font-weight: bold;
  color: #333;
}

.error-badge {
  background: #f44336;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
}

.stat-block-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.stat-block-item {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.stat-block-item:hover {
  background: #f9f9f9;
  border-color: #999;
}

.stat-block-item.has-errors {
  border-left: 4px solid #f44336;
}

.stat-block-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.format-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  color: white;
  font-weight: bold;
  font-size: 11px;
}

.stat-block-name {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.error-indicator {
  font-size: 16px;
}

.stat-block-category {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.stat-block-errors {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.error-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: #ffebee;
  border-radius: 3px;
  margin-bottom: 6px;
  font-size: 11px;
}

.error-type {
  font-weight: 600;
  color: #c62828;
  text-transform: uppercase;
  font-size: 10px;
}

.error-msg {
  color: #555;
}
```

---

## 🎯 Critical Validation Rules to Enforce

### 1. **Attribute Phrasing Enforcement (Domain A)**
**Rule:** Classed NPCs (Format A) must use long-form PHB-ordered attributes:
```
✅ CORRECT: "Their primary attributes are strength, dexterity, constitution, intelligence, wisdom, charisma"
❌ WRONG:   "Their primary attributes are physical"
```

**Implementation:** `cnc-validation-rules.js`
```javascript
function validateAttributePhrasing(text, classification) {
  if (classification.format !== 'A') return null; // Only applies to Classed NPCs
  
  const hasShorthand = /Their primary attributes are physical/i.test(text);
  
  if (hasShorthand) {
    return {
      type: 'ATTRIBUTE_PHRASING',
      severity: 'error',
      message: 'Classed NPC must use long-form attributes in PHB order',
      detected: 'Their primary attributes are physical',
      expected: 'Their primary attributes are strength, dexterity, constitution, intelligence, wisdom, charisma',
      autoFix: true
    };
  }
  
  return null;
}
```

### 2. **Level Notation Validation**
**Rule:** Level notation (1st, 5th, etc.) must NOT appear inside parentheses
```
❌ WRONG: **Goblin Shaman** (5th level wizard, HD 5, HP 22, AC 12)
✅ CORRECT: **Goblin Shaman, 5th Level** (wizard, HD 5, HP 22, AC 12)
```

**Implementation:**
```javascript
function validateLevelNotation(text) {
  const pattern = /\(([^)]*\d+(?:st|nd|rd|th)\s+level[^)]*)\)/gi;
  const match = pattern.exec(text);
  
  if (match) {
    return {
      type: 'LEVEL_NOTATION_IN_PARENTHESES',
      severity: 'error',
      message: 'Level notation must not appear inside parentheses',
      detected: match[0],
      fix: 'Move level notation to header or remove ordinal suffix'
    };
  }
  
  return null;
}
```

### 3. **Classification Governor Logic (HasSpells Priority)**
**Rule:** Spellcasters ALWAYS classified as Format A, regardless of race
```
✅ "Goblin Shaman" with spells → Format A (Classed NPC)
✅ "Orc Witch Doctor" with spells → Format A (Classed NPC)
❌ "Goblin" without spells → Format B (Monster)
```

**Implementation:** Already in `classification-rules.ts` Step 1 (highest priority)

---

## 📊 Expected Results After Integration

### Classification Display Examples:

1. **Format A - Classed NPC (Spellcaster)**
   ```
   Format: A
   Category: Classed NPC
   Subtype: Spellcaster
   Reasoning: Classed NPC (Spellcaster - highest priority override) - wizard
   Step: 1 (HasSpells)
   Signals: HasSpells=true, HasClassKeyword=true, IsNamed=true
   ```

2. **Format B - Monster**
   ```
   Format: B
   Category: Monster
   Subtype: monster
   Reasoning: Monster (default - no class/rank/humanoid signals)
   Step: 5 (Default)
   Signals: All false
   ```

3. **Format C - Unit**
   ```
   Format: C
   Category: Unit
   Subtype: monster-unit
   Reasoning: Unit (bandit group override)
   Step: 4 (IsUnit)
   Signals: IsUnit=true
   ```

---

## 🔧 Testing Strategy

### Test Cases:
1. **Goblin Shaman** (spells) → Should classify as Format A with spellcaster subtype
2. **Elf, Wood, Bowman** (monster entry) → Should classify as Format B
3. **Bandits x4** (group) → Should classify as Format C (unit)
4. **Marcus, 5th Level Fighter** (named humanoid) → Should classify as Format A
5. **Pinky the Owlbear** (named non-humanoid) → Should classify as Format B

### Validation Tests:
- Classed NPC with "physical" shorthand → Should flag ATTRIBUTE_PHRASING error
- Parenthetical with "5th level" inside → Should flag LEVEL_NOTATION error
- Monster with correct Saves notation → Should pass validation

---

## 📝 Next Actions

1. **Start with Step 1:** Convert TypeScript to JavaScript (most time-consuming)
2. **Then Step 2:** Add IPC handlers (quick win)
3. **Finally Step 3:** Build UI components (visible results)

**Estimated Total Time:** 6-9 hours for complete integration

---

## ✅ Success Criteria

- [ ] All 4 TypeScript files converted to Node.js modules
- [ ] IPC handler returns structured classification + validation results
- [ ] UI displays Format A/B/C badges with color coding
- [ ] Validation errors shown with red badges
- [ ] Click-to-jump navigation to stat blocks
- [ ] Auto-analysis when document loads
- [ ] All 3 critical validation rules enforced
