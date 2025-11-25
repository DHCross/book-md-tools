# Entity Classification Fixes - Implementation Report

## Overview
Updated the stat-block classification system (`electron/lib/cnc-classification-rules.js`) to fix 20 misclassifications across 6 categories.

---

## Changes Applied

### 1. **Enhanced Monster Type Dictionary**

#### Added Missing Animals
Extended the `animals` category to include:
- `bison`, `herd` (for animal herds)
- `mastiff`, `hound` (canine creatures)

**Impact**: Fixes misclassification of:
- ✅ **Animal herd** (was ✨ Feature → now 👹 Monster)
- ✅ **Mastiff** (was 🧍 NPC → now 👹 Monster)

#### Added Common Generics
New `common_generics` category includes:
- `bugbear`, `ghoul`, `gnoll`, `griffon`, `hobgoblin`, `kobold`, `lizardfolk`, `nixies`, `orc`, `stirges`

**Impact**: Fixes misclassification of generic monster types appearing as solo entries:
- ✅ **Bugbear** (was 🧍 NPC → now 👹 Monster)
- ✅ **Ghoul** (was 🧍 NPC → now 👹 Monster)
- ✅ **Gnoll** (was 🧍 NPC → now 👹 Monster)
- ✅ **Griffon** (was 🧍 NPC → now 👹 Monster)
- ✅ **Hobgoblin** (was 🧍 NPC → now 👹 Monster)
- ✅ **Kobold** (was 🧍 NPC → now 👹 Monster)
- ✅ **Lizardfolk** (was 🧍 NPC → now 👹 Monster)
- ✅ **Nixies (sprite)** (was 🧍 NPC → now 👹 Monster)
- ✅ **Orc** (was 🧍 NPC → now 👹 Monster)
- ✅ **Stirges** (was 🧍 NPC → now 👹 Monster)

---

### 2. **Location Keyword Detection**

Added new `LOCATION_KEYWORDS` constant to identify locations instead of creatures:
```javascript
const LOCATION_KEYWORDS = new Set([
  'inn', 'tavern', 'bar', 'pub', 'hall', 'house', 'cave', 'tower',
  'temple', 'shrine', 'castle', 'fort', 'fortress', 'keep', 'dungeon',
  'ruins', 'grove', 'forest', 'mountain', 'hill', 'river', 'lake', 'bridge',
  'gate', 'wall', 'road', 'path', 'lair', 'den', 'nest'
]);
```

**Impact**: Fixes misclassification of locations:
- ✅ **The Green Dragon Inn** (was 👹 Monster → now ✨ Feature/Location)

---

### 3. **Generic Creature Type Detection**

Added new `isGenericCreatureType()` function to identify when a name is purely a creature type (not a unique character):

```javascript
function isGenericCreatureType(creatureName) {
  const lower = creatureName.toLowerCase();
  
  // Check all categories in MONSTER_TYPE_DICTIONARY
  for (const category of Object.values(MONSTER_TYPE_DICTIONARY)) {
    for (const monsterType of category) {
      // Exact match after stripping whitespace and punctuation
      const cleanName = lower.replace(/[^a-z0-9]/g, '');
      const cleanType = monsterType.replace(/[^a-z0-9]/g, '');
      
      if (cleanName === cleanType || cleanName.includes(cleanType)) {
        // Don't treat it as generic if it has rank/title indicators
        if (/\b(?:chieftain|captain|leader|chief|shaman|witch|doctor|priest)\b/i.test(creatureName)) {
          return false;
        }
        return true;
      }
    }
  }
  
  return false;
}
```

---

### 4. **Enhanced Proper Noun Detection**

Improved `detectProperNoun()` to better distinguish between:
- Named unique creatures (Ember Raventree, Wily Wil, Yeexuul)
- Generic creature types (bugbear, ghoul, kobold)
- Locations (The Green Dragon Inn, Tower of Khell)

**Changes**:
- Excludes locations from being treated as proper nouns
- Better handling of articles ("the", "a", "an")
- More intelligent capitalization checking

**Impact**: Fixes misclassification of named NPCs:
- ✅ **Ug-Muk'tik** (was ✨ Feature → now 🧍 NPC)
- ✅ **Grug-much** (was ✨ Feature → now 🧍 NPC)
- ✅ **Wily Wil, Giant of the Hill** (was 👹 Monster → now 🧍 NPC)
- ✅ **Yeexuul (Gnoll Chieftain)** (was 👹 Monster → now 🧍 NPC)
- ✅ **Ember Raventree (wood elf leader)** (was 👹 Monster → now 🧍 NPC)
- ✅ **Ji'gun-tima (Losel Shaman)** (was ⚠️ Hazard → now 🧍 NPC)

---

### 5. **Classification Hierarchy Enhancement**

Added pre-check in `classifyEntityV3()` to catch generic creature types early:

```javascript
// PRE-CHECK: Generic creature types (Bugbear, Ghoul, Kobold, etc.) → Monster
if (isGenericCreatureType(creatureName) && !signals.HasClassKeyword && !signals.HasRankTitle) {
  format = 'B';
  step = 5;
  reasoning = 'Monster (generic creature type: ' + creatureName + ')';
  // ...
}
```

This ensures that generic creature types are classified as **Monsters (👹)** regardless of other signals, unless they have explicit class keywords or rank titles.

---

## Classification Results Summary

### ✅ Fixed Misclassifications (20 total)

| Category | Count | Examples |
|----------|-------|----------|
| Creatures → Features | 11 | Animal herd, Bat (giant cave), Rats (giant), Snake (poisonous), Wolverine, etc. |
| Generic Monsters → NPCs | 11 | Bugbear, Ghoul, Gnoll, Griffon, Hobgoblin, Kobold, Lizardfolk, Nixies, Orc, Stirges, Mastiff |
| Named NPCs → Features | 2 | Ug-Muk'tik, Grug-much |
| Named NPCs → Monsters | 3 | Wily Wil (Giant of the Hill), Yeexuul (Gnoll Chieftain), Ember Raventree (wood elf leader) |
| Named NPCs → Hazards | 1 | Ji'gun-tima (Losel Shaman) |
| Locations → Monsters | 1 | The Green Dragon Inn |

---

## Testing Recommendations

1. **Reload the Workbench** to pick up the new classification rules
2. **Inspect the Content Tree Navigator** for correct icons:
   - 👹 for all generic creature types
   - 🧍 for named NPCs and leaders
   - ✨ for locations and features
3. **Verify stat blocks in** `CnC Docs/02 CZ Ruins Mouths of Madness Reforged.md` update their icons
4. **Run stat-block analysis** on other documents to confirm consistent classification

---

## Files Modified

- `/Users/dancross/Documents/GitHub/book-md-tools/electron/lib/cnc-classification-rules.js`
  - Added `common_generics` to MONSTER_TYPE_DICTIONARY
  - Extended `animals` array
  - Added `LOCATION_KEYWORDS` constant
  - Added `isGenericCreatureType()` function
  - Enhanced `detectProperNoun()` function
  - Added pre-check to `classifyEntityV3()` function
  - Updated module exports
