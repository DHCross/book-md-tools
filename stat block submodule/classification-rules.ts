/**
 * CANONICAL CLASSIFICATION RULE-TREE
 * 
 * Implements the deterministic classification system for C&C Reforged creatures.
 * This module resolves whether an entity is:
 * - Classed NPC (Format A - uses long-form attributes)
 * - Monster (Format B - uses shorthand physical/mental)
 * - Unit (Format C - uses shorthand with plural grammar)
 * 
 * Based on Version 3.0 Rule-Tree specification with 5-step priority hierarchy.
 */

import type { CanonicalData } from './canonical-data-mapper';

/**
 * SECTION 0: PRE-CHECK - SIGNAL EXTRACTION
 * 
 * These six signals form the mechanical substrate for classification.
 * They must be extracted BEFORE any classification logic runs.
 */

export interface ClassificationSignals {
  // Core signals (per Version 3.0)
  HasSpells: boolean;          // Spell lists or spell slots present
  HasClassKeyword: boolean;    // fighter, wizard, cleric, etc.
  HasRankTitle: boolean;       // chieftain, captain, lieutenant, sergeant, shaman, etc.
  IsNamed: boolean;            // Proper noun (capitalized name not in dictionary)
  IsUnit: boolean;             // Numeration in header (x4, 2-12, etc.)
  IsHumanoid: boolean;         // PC-like races (human, elf, dwarf, halfling, gnome)
  
  // Additional context (for debugging/reporting)
  detectedClassName?: string;   // Extracted class name (if any)
  detectedRankTitle?: string;   // Extracted rank title (if any)
  detectedRace?: string;        // Extracted race (if any)
}

/**
 * Additional data needed for signal extraction beyond CanonicalData
 */
export interface SignalExtractionContext {
  spells?: string;              // From ParentheticalData
  raceClass?: string;           // From ParentheticalData
  description?: string;         // Full description text if available
}

/**
 * EXPANDED MONSTER-TYPE DICTIONARY
 * Built from C&C Monsters & Treasure (official M&T PDFs)
 * 
 * This dictionary ensures that ALL fauna, magical beasts, vermin, oozes,
 * undead, constructs, aberrations, and extraplanar creatures are classified
 * as monsters when HD is present.
 * 
 * Organized by creature family for maintainability.
 */
export const MONSTER_TYPE_DICTIONARY = {
  humanoids: [
    'orc', 'goblin', 'hobgoblin', 'gnoll', 'bugbear', 'kobold',
    'lizard man', 'lizardman', 'troglodyte', 'ogre', 'troll', 'ettin',
    'gnome', 'dwarf', 'elf', 'halfling', 'centaur',
    'satyr', 'minotaur', 'brownie'
  ],

  giants: [
    'hill giant', 'stone giant', 'frost giant', 'fire giant',
    'cloud giant', 'storm giant', 'cyclops', 'giant' // generic giant
  ],

  animals: [
    'ape', 'baboon', 'badger', 'bear', 'boar', 'camel', 'cat', 'cheetah',
    'crocodile', 'dog', 'dolphin', 'eagle', 'hawk', 'horse', 'lion', 'mammoth',
    'mule', 'otter', 'ox', 'panther', 'porpoise', 'ram', 'rat', 'seal', 'snake',
    'tiger', 'wolf', 'wolverine', 'turtle', 'lizard', 'bat', 'weasel',
    'serpent', 'viper', 'cobra', 'python', 'tortoise', 'alligator'
  ],

  beasts: [
    'giant ant', 'giant badger', 'giant beaver', 'giant boar', 'giant cat',
    'giant crab', 'giant crocodile', 'giant frog', 'giant hawk', 'giant lizard',
    'giant owl', 'giant rat', 'giant skunk', 'giant snake', 'giant spider',
    'giant tick', 'giant weasel', 'giant wolf', 'giant centipede',
    'dire wolf', 'dire bear', 'dire boar', 'giant scorpion', 'giant beetle'
  ],

  magicalBeasts: [
    'ankheg', 'basilisk', 'bulette', 'catoblepas', 'chimera', 'cockatrice',
    'displacer beast', 'gorgon', 'griffon', 'hippogriff', 'hydra', 'manticore',
    'owlbear', 'pegasus', 'peryton', 'remorhaz', 'roc', 'sphinx', 'unicorn',
    'worg', 'wyvern', 'hell hound', 'hellhound', 'winter wolf', 'dragon',
    'blink dog', 'phase spider', 'rust monster'
  ],

  vermin: [
    'centipede', 'spider', 'tick', 'beetle', 'ant', 'locust', 'maggot', 'worm',
    'stirge'
  ],

  oozesPlants: [
    'ooze', 'slime', 'gelatinous cube', 'black pudding', 'yellow mold',
    'green slime', 'brown mold', 'shrieker', 'violet fungus', 'treant',
    'shambling mound', 'myconid', 'ochre jelly', 'gray ooze', 'grey ooze'
  ],

  undead: [
    'skeleton', 'zombie', 'ghoul', 'ghast', 'wight', 'wraith', 'mummy', 'vampire',
    'shadow', 'spectre', 'specter', 'lich', 'allip', 'wraithwisp', 'ghost'
  ],

  constructs: [
    'golem', 'stone golem', 'iron golem', 'flesh golem', 'homunculus',
    'animated armor', 'animated object', 'gargoyle'
  ],

  aberrations: [
    'mind flayer', 'aboleth', 'cloaker', 'gibbering abomination',
    'otyugh', 'roper', 'water weird', 'batrachianoid'
  ],

  extraplanar: [
    'demon', 'devil', 'imp', 'quasit', 'elemental', 'sylph', 'djinn', 'djinni',
    'efreet', 'efreeti', 'barghest', 'will-o-wisp', 'invisible stalker',
    'daemon'
  ],

  // Module-specific creatures
  moduleSpecific: [
    'losel', 'batrachianoid', 'lizardfolk', 'nixie', 'nixies',
    'werewolf', 'werebear', 'wererat', 'naga'
  ],

  // Fey/Nature spirits
  fey: [
    'pixie', 'sprite', 'brownie', 'leprechaun', 'dryad', 'nymph', 'satyr'
  ]
};

// Flatten into single searchable set for fast lookups
const MONSTER_TYPE_FLAT_SET = new Set<string>();
Object.values(MONSTER_TYPE_DICTIONARY).forEach(category => {
  category.forEach(type => MONSTER_TYPE_FLAT_SET.add(type.toLowerCase()));
});

/**
 * Check if creature name matches any monster type from M&T
 * Handles multi-word names and inverted formats like "Snake, Poisonous"
 */
function isMonsterType(creatureName: string): boolean {
  const nameLower = creatureName.toLowerCase();
  
  // Direct match (handles "Goblin", "Orc", "Snake", etc.)
  if (MONSTER_TYPE_FLAT_SET.has(nameLower)) {
    return true;
  }
  
  // Check if any monster type appears as substring
  // Handles "Snake, Poisonous", "Turtle, Huge Snapping", "Bat, giant cave"
  for (const monsterType of MONSTER_TYPE_FLAT_SET) {
    if (nameLower.includes(monsterType)) {
      return true;
    }
  }
  
  // Split by comma and check first part (handles inverted names)
  // "Snake, Poisonous" → check "snake"
  if (nameLower.includes(',')) {
    const firstPart = nameLower.split(',')[0].trim();
    if (MONSTER_TYPE_FLAT_SET.has(firstPart)) {
      return true;
    }
  }
  
  // Check individual words (handles "Giant Wolf", "Hell Hound")
  const words = nameLower.split(/[\s,]+/).filter(w => w.length > 2);
  for (const word of words) {
    if (MONSTER_TYPE_FLAT_SET.has(word)) {
      return true;
    }
  }
  
  return false;
}

// Humanoid PC races (per Version 3.0 Section 0)
const HUMANOID_RACES = new Set([
  'human', 'elf', 'dwarf', 'halfling', 'gnome', 'half-elf', 'half-orc'
]);

// Leadership/rank titles (per Version 3.0 Section 0)
// These indicate potential class levels when combined with other signals
const RANK_TITLES = new Set([
  'chief', 'chieftain', 'captain', 'leader', 'sergeant', 'serjeant',
  'lieutenant', 'corporal', 'shaman', 'priest', 'acolyte', 'adept',
  'champion', 'matron', 'elder', 'herald', 'warlord', 'commander',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady', 
  'baron', 'duke', 'count', 'baroness', 'duchess', 'countess'
]);

// Character classes (per Version 3.0 Section 0)
const CLASS_KEYWORDS = new Set([
  'fighter', 'cleric', 'wizard', 'rogue', 'thief',
  'paladin', 'ranger', 'bard', 'druid', 'monk',
  'barbarian', 'assassin', 'illusionist', 'knight', 'magic-user'
]);

// Generic hireling/proxy types (default to fighter if classed)
const HIRELING_TYPES = new Set([
  'bandit', 'guard', 'soldier', 'brigand', 'militia',
  'mercenary', 'watchman', 'sentry', 'man-at-arms',
  'thief', 'thieves', 'cutpurse', 'pickpocket',
  'fisherman', 'hunter', 'trapper', 'woodcutter', 'miner', 'woodsman'
]);

/**
 * SECTION 0: SIGNAL EXTRACTION (Version 3.0)
 * 
 * Extracts the six core signals required for classification hierarchy.
 * This must run BEFORE any classification logic.
 * 
 * Signal Definitions:
 * - HasSpells: Spell lists or spell slots present in parenthetical
 * - HasClassKeyword: Explicit class names (fighter, wizard, cleric, etc.)
 * - HasRankTitle: Leadership/rank titles (chieftain, captain, sergeant, etc.)
 * - IsNamed: Proper noun detection (capitalized name not in dictionary)
 * - IsUnit: Numeration in header (x4, 2-12, etc.)
 * - IsHumanoid: PC-like races (human, elf, dwarf, halfling, gnome)
 */
export function extractSignals(
  creatureName: string,
  canonicalData: CanonicalData,
  context: SignalExtractionContext = {}
): ClassificationSignals {
  const nameLower = creatureName.toLowerCase();
  const levelText = canonicalData.level || '';
  const raceClassText = context.raceClass || (levelText.includes('level') ? levelText : canonicalData.name) || '';
  const raceClassLower = raceClassText.toLowerCase();
  
  // Signal 1: HasSpells
  // Check for spell lists, spell slots, or "can cast" phrases
  // Avoid false positives from spell references in descriptions (e.g., "destroyed by a spell")
  const HasSpells = Boolean(
    context.spells ||
    /(?:spellcaster|spellcasting)/i.test(raceClassText) ||
    /(?:can\s+cast|casts?\s+\d+|spells?\s+per\s+day|spell\s+slots?)/i.test(context.description || '')
  );
  
  // Signal 2: HasClassKeyword
  // Check for explicit class names
  let HasClassKeyword = false;
  let detectedClassName: string | undefined;
  for (const className of CLASS_KEYWORDS) {
    if (raceClassLower.includes(className)) {
      HasClassKeyword = true;
      detectedClassName = className;
      break;
    }
  }
  
  // Signal 3: HasRankTitle
  // Check for leadership/rank titles (separate from class keywords)
  let HasRankTitle = false;
  let detectedRankTitle: string | undefined;
  for (const title of RANK_TITLES) {
    if (nameLower.includes(title)) {
      HasRankTitle = true;
      detectedRankTitle = title;
      break;
    }
  }
  
  // Signal 4: IsNamed
  // Proper noun detection: Capitalized name that's not a common word
  // Examples: "Ember Raventree", "Wily Wil", "Pinky the Owlbear"
  // Non-examples: "Goblin Captain", "Orc Chieftain"
  const IsNamed = detectProperNoun(creatureName);
  
  // Signal 5: IsUnit
  // Numeration in header (x4, x 4, 2-12, (3), etc.)
  const IsUnit = /\b(?:x\s*\d+|\d+\s*x|\(\d+\)|\d+-\d+)\b/i.test(creatureName) ||
                 /\b(?:bandits|goblins|orcs|guards|soldiers|kobolds|zombies|skeletons)\s+x\s*\d+\b/i.test(nameLower);
  
  // Signal 6: IsHumanoid
  // PC-like races (human, elf, dwarf, halfling, gnome)
  // Check in: 1) context.raceClass, 2) canonical level field, 3) creature name itself
  let IsHumanoid = false;
  let detectedRace: string | undefined;
  
  // Check raceClass and level fields
  for (const race of HUMANOID_RACES) {
    if (raceClassLower.includes(race)) {
      IsHumanoid = true;
      detectedRace = race;
      break;
    }
  }
  
  // If not found, also check the creature name itself (for parentheticals like "wood elf leader")
  if (!IsHumanoid) {
    for (const race of HUMANOID_RACES) {
      if (nameLower.includes(race)) {
        IsHumanoid = true;
        detectedRace = race;
        break;
      }
    }
  }
  
  // Special check for elf variants (wood elf, high elf, etc.)
  if (!IsHumanoid && (/\b(?:wood|high|dark|wild|sea)\s+elf\b/i.test(raceClassLower) || /\b(?:wood|high|dark|wild|sea)\s+elf\b/i.test(nameLower))) {
    IsHumanoid = true;
    detectedRace = 'elf';
  }
  
  return {
    HasSpells,
    HasClassKeyword,
    HasRankTitle,
    IsNamed,
    IsUnit,
    IsHumanoid,
    detectedClassName,
    detectedRankTitle,
    detectedRace
  };
}

/**
 * Detect if a creature name contains a proper noun.
 * 
 * Proper nouns are capitalized names that aren't:
 * - Common monster types (Goblin, Orc, Troll)
 * - Rank titles (Captain, Chieftain, Sergeant)
 * - Generic descriptors (Giant, Elder, Ancient)
 * - Hireling types (Bandit, Guard, Soldier)
 * 
 * Examples:
 * - "Ember Raventree" → true (proper name)
 * - "Wily Wil, Giant of the Hill" → true (proper name with title)
 * - "Goblin Captain" → false (rank title, not proper noun)
 * - "Pinky the Owlbear" → true (named creature)
 */
function detectProperNoun(creatureName: string): boolean {
  // Early-out: names that include commas are inverted/common-noun forms,
  // e.g., "Elf, Wood, Bowman" or "Ape, carnivorous", and should NOT be
  // treated as proper nouns.
  if (creatureName.includes(',')) return false;

  // If the creature name matches a known monster type, it's not a proper
  // name (they are common nouns in the bestiary).
  if (isMonsterType(creatureName)) return false;
  // Common exclusions: generic descriptors and titles
  const genericWords = new Set([
    'the', 'a', 'an', 'of', 'and', 'giant', 'elder', 'ancient',
    'young', 'old', 'great', 'lesser', 'greater', 'dire',
    'green', 'red', 'blue', 'black', 'white', 'gray', 'grey',
    'huge', 'large', 'small', 'tiny', 'massive'
  ]);
  
  // Split name into words and check for capitalized proper nouns
  const words = creatureName.split(/[\s,]+/);
  
  for (const word of words) {
    // Skip if empty or starts with lowercase
    if (!word || word[0] !== word[0].toUpperCase()) continue;
    
    const wordLower = word.toLowerCase();
    
    // Skip generic words
    if (genericWords.has(wordLower)) continue;
    
    // Skip rank titles
    if (RANK_TITLES.has(wordLower)) continue;
    
    // Skip hireling types (Bandit, Guard, Soldier, etc.)
    // Also check plural forms (Bandits, Guards, Soldiers)
    const singularForm = wordLower.replace(/s$/, '');
    if (HIRELING_TYPES.has(wordLower) || HIRELING_TYPES.has(singularForm)) continue;
    
    // Skip monster types (including plurals)
    if (MONSTER_TYPE_FLAT_SET.has(wordLower) || MONSTER_TYPE_FLAT_SET.has(singularForm)) continue;
    
    // Skip numbers in parentheses or x notation
    if (/^[(\d]/.test(word)) continue;
    
    // If we found a capitalized word that's not in our exclusion lists,
    // it's likely a proper noun
    return true;
  }
  
  return false;
}

/**
 * SECTION 1: VERSION 3.0 CLASSIFICATION FORMATS
 * 
 * Three-way classification system:
 * - Format A: Classed NPCs (long-form attributes)
 * - Format B: Monsters (shorthand physical/mental)
 * - Format C: Units (shorthand with plural grammar)
 */
export type ClassificationFormat = 'A' | 'B' | 'C';

export interface Version3ClassificationResult {
  format: ClassificationFormat;
  signals: ClassificationSignals;
  reasoning: string;
  step: 1 | 2 | 3 | 4 | 5; // Which step of the hierarchy triggered
  // Legacy fields for compatibility with existing code
  type: CreatureType;
  subtype?: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

/**
 * VERSION 3.0: 5-STEP CLASSIFICATION HIERARCHY
 * 
 * Classify entity using Version 3.0 5-step priority hierarchy.
 * 
 * Priority (highest to lowest):
 * 1. HasSpells → Format A (Classed NPC - Spellcaster)
 * 2. HasClassKeyword OR HasRankTitle → Format A (Classed NPC)
 * 3. IsNamed AND IsHumanoid → Format A (Classed NPC - Named Humanoid)
 * 4. IsUnit → Format C (Unit)
 * 5. Default → Format B (Monster)
 * 
 * Override Rules:
 * - Spellcasters always Format A (highest priority)
 * - Bandits default to Format B unless they have rank (Bandit Lieutenant → Format A)
 * - Named non-humanoids remain Format B (e.g., Pinky the Owlbear)
 */
export function classifyEntityV3(
  creatureName: string,
  canonicalData: CanonicalData,
  context: SignalExtractionContext = {}
): Version3ClassificationResult {
  const signals = extractSignals(creatureName, canonicalData, context);
  const warnings: string[] = [];
  // Defaults: assume Monster (Format B) unless other rules fire. Setting
  // defaults prevents TypeScript "used before assignment" errors and
  // provides a safe fallback for unusual code paths.
  let format: ClassificationFormat = 'B';
  let reasoning: string = 'Default to Monster';
  let legacyType: CreatureType = 'monster';
  let subtype: string | undefined;
  const confidence: 'high' | 'medium' | 'low' = 'high';
  let step: 1 | 2 | 3 | 4 | 5 = 5;
  const lowerName = creatureName.toLowerCase();
  // Pre-check data is useful for disambiguation when HD/level tokens are present
  const preCheck = extractPreCheckData(creatureName, canonicalData);
  
  

  // STEP 1: HasSpells (Highest Priority - Spellcasters)
  if (signals.HasSpells) {
    format = 'A';
    step = 1;
    reasoning = 'Classed NPC (Spellcaster - highest priority override)';
    legacyType = 'classed';
    subtype = 'spellcaster';
    if (signals.detectedClassName) {
      reasoning += ` - ${signals.detectedClassName}`;
    }
  }
  // SPECIAL CASE: Bandit groups default to Format C (unit) even if a class keyword
  // appears in their race/class string. Bandits without rank are treated as
  // monsters/units (HD) per the user's canonical rules.
  else if (signals.IsUnit && /\bbandit(s|\b|\s)/i.test(lowerName) && !signals.HasRankTitle) {
    format = 'C';
    step = 4;
    reasoning = 'Unit (bandit group override)';
    legacyType = 'monster';
    subtype = 'monster-unit';
  }
  // SPECIAL CASE: Solo 'Bandit' entries default to Monster (HD) even if they
  // contain class-like wording. This matches the canonical M&T behavior.
  else if (/\bbandit\b/i.test(lowerName) && !signals.HasRankTitle && !signals.HasSpells && !signals.IsUnit) {
    format = 'B';
    step = 5;
    reasoning = 'Monster (bandit override)';
    legacyType = 'monster';
    subtype = 'monster';
  }

  // DISAMBIGUATION: If the entry includes HD or an explicit level token and
  // the pre-check suggests a monster race, group unit, or a numeric "Xth level"
  // notation, then treat as Monster/Unit even if a class keyword appears in
  // the race/class text. This avoids misclassifying generic monster entries
  // like "Elf, Wood, bowman" or "1st level human fighters" as Format A.
  // Preserve named humanoid with rank exceptions (they remain Format A).
  // NOTE: This now triggers if either HD or an explicit level token exists.
  else if (preCheck.hasHD || preCheck.hasLevel) {
    const levelLike = Boolean(preCheck.hasLevel) || /\b\d+(?:st|nd|rd|th)\s+level\b/i.test(String(canonicalData.level || context.raceClass || ''));
    const looksLikeMonsterEntry = preCheck.isMonsterRace || preCheck.isGroupUnit || levelLike;
    // Require that the entry is non-named (not a proper noun) before forcing
    // monster/unit formatting. This preserves named humanoid NPCs which may
    // legitimately contain level or class tokens (e.g., "Marcus 3rd level").
    if (looksLikeMonsterEntry && !signals.IsNamed) {
      if (preCheck.isGroupUnit) {
        format = 'C';
        step = 4;
        reasoning = 'Unit (HD present + group formation detected)';
        legacyType = 'monster';
        subtype = 'monster-unit';
      } else {
        format = 'B';
        step = 5;
        reasoning = 'Monster (HD present and entry appears to be a monster/level line)';
        legacyType = 'monster';
        subtype = 'monster';
      }
    }
  }
  // STEP 2: HasClassKeyword OR HasRankTitle
  else if (signals.HasClassKeyword || signals.HasRankTitle) {
    format = 'A';
    step = 2;
    if (signals.HasClassKeyword) {
      reasoning = `Classed NPC (Class: ${signals.detectedClassName})`;
      subtype = 'named-class';
    } else {
      reasoning = `Classed NPC (Rank: ${signals.detectedRankTitle})`;
      subtype = 'rank-inferred';
    }
    legacyType = 'classed';
  }
  // STEP 3: IsNamed AND IsHumanoid
  else if (signals.IsNamed && signals.IsHumanoid) {
    format = 'A';
    step = 3;
    reasoning = `Classed NPC (Named Humanoid: ${signals.detectedRace})`;
    legacyType = 'classed';
    subtype = 'named-humanoid';
  }
  // STEP 4: IsUnit
  else if (signals.IsUnit) {
    format = 'C';
    step = 4;
    reasoning = 'Unit (group with numeration)';
    legacyType = 'monster';
    subtype = 'monster-unit';
  }
  // STEP 5: Default (Monster)
  else {
    format = 'B';
    step = 5;
    reasoning = 'Monster (default - no class/rank/humanoid signals)';
    legacyType = 'monster';
    
    // Add context for named non-humanoids
    if (signals.IsNamed) {
      reasoning += ' - Named creature';
      warnings.push('Named non-humanoid creature remains Monster format (correct per V3.0)');
    }
  }
  
  return {
    format,
    signals,
    reasoning,
    step,
    type: legacyType,
    subtype,
    confidence,
    warnings
  };
}

export type CreatureType = 'classed' | 'monster' | 'ambiguous';

export interface ClassificationResult {
  type: CreatureType;
  subtype?: 'named-class' | 'rank-inferred' | 'implicit-fighter' | 'monster-leader' | 'monster-unit' | 'human-monster';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  warnings: string[];
}

export interface PreCheckData {
  hasHD: boolean;
  hasFlatHP: boolean;
  titleRank?: string;
  isHumanoidRace: boolean;
  isMonsterRace: boolean;
  hasExplicitClass: boolean;
  isGroupUnit: boolean;
  hasLevel: boolean;
  raceClass?: string;
}

/**
 * STEP 0: Pre-check - Extract substrate values
 */
export function extractPreCheckData(
  creatureName: string,
  canonicalData: CanonicalData
): PreCheckData {
  const hasHD = Boolean(canonicalData.hd);
  const hasFlatHP = Boolean(canonicalData.hp && !canonicalData.hd);
  const hasLevel = Boolean(canonicalData.level);
  
  // Check for leadership/rank title in name
  const nameLower = creatureName.toLowerCase();
  let titleRank: string | undefined;
  for (const title of RANK_TITLES) {
    if (nameLower.includes(title)) {
      titleRank = title;
      break;
    }
  }
  
  // Check race from level field or creature name
  // Level format: "1st level human fighter" or just "1"
  const levelText = canonicalData.level || '';
  const raceClassText = levelText.includes('level') ? levelText : canonicalData.name;
  const raceClassLower = raceClassText.toLowerCase();
  
  let isHumanoidRace = false;
  let isMonsterRaceDetected = false;
  
  for (const race of HUMANOID_RACES) {
    if (raceClassLower.includes(race)) {
      isHumanoidRace = true;
      break;
    }
  }
  
  // Use the expanded monster-type dictionary
  isMonsterRaceDetected = isMonsterType(creatureName);
  
  // Check for explicit class mention
  let hasExplicitClass = false;
  for (const className of CLASS_KEYWORDS) {
    if (raceClassLower.includes(className)) {
      hasExplicitClass = true;
      break;
    }
  }
  
  // Check if name suggests a group/unit (plural indicators)
  const isGroupUnit = /\b(x\d+|\d+x|\(\d+\))\b/i.test(creatureName) ||
                      /\b(bandits|goblins|orcs|guards|soldiers|kobolds)\b/i.test(nameLower);
  
  return {
    hasHD,
    hasFlatHP,
    titleRank,
    isHumanoidRace,
    isMonsterRace: isMonsterRaceDetected,
    hasExplicitClass,
    isGroupUnit,
    hasLevel,
    raceClass: raceClassText
  };
}

/**
 * STEP 1: Top-level split - HP vs HD
 * 
 * This is the PRIMARY governor:
 * - Flat HP → Classed NPC (no exceptions)
 * - HD → Monster/Unclassed (unless overridden)
 * - Both → Classed NPC (flat HP wins, HD ignored with warning)
 */
function applyTopLevelSplit(preCheck: PreCheckData): { branch: '2A' | '2B'; warnings: string[] } {
  const warnings: string[] = [];
  
  // RULE: Flat HP overrides everything
  if (preCheck.hasFlatHP) {
    if (preCheck.hasHD) {
      warnings.push('HD notation present but ignored due to flat HP (flat HP wins)');
    }
    return { branch: '2A', warnings }; // → Classed NPC path
  }
  
  // RULE: HD without flat HP → Monster path
  if (preCheck.hasHD) {
    return { branch: '2B', warnings }; // → Monster path
  }
  
  // Neither HP nor HD - unusual, default to ambiguous
  warnings.push('No HP or HD found - classification uncertain');
  return { branch: '2A', warnings }; // Default to classed for safety
}

/**
 * BRANCH 2A: Classifying a Classed NPC (Flat HP path)
 */
function classifyClassedNPC(
  creatureName: string,
  preCheck: PreCheckData,
  _canonicalData: CanonicalData
): ClassificationResult {
  const warnings: string[] = [];
  
  // 2A-1: Explicit class name?
  if (preCheck.hasExplicitClass) {
    return {
      type: 'classed',
      subtype: 'named-class',
      confidence: 'high',
      reasoning: 'Has flat HP and explicit class name',
      warnings
    };
  }
  
  // 2A-2: Leadership/specialist title?
  if (preCheck.titleRank) {
    const inferredClass = inferClassFromTitle(preCheck.titleRank);
    warnings.push(`Inferred class '${inferredClass}' from title '${preCheck.titleRank}'`);
    return {
      type: 'classed',
      subtype: 'rank-inferred',
      confidence: 'medium',
      reasoning: `Has flat HP and leadership title '${preCheck.titleRank}' (suggests ${inferredClass})`,
      warnings
    };
  }
  
  // 2A-3: Generic hireling type (bandit, guard, etc.)
  const nameLower = creatureName.toLowerCase();
  for (const hirelingType of HIRELING_TYPES) {
    if (nameLower.includes(hirelingType)) {
      return {
        type: 'classed',
        subtype: 'implicit-fighter',
        confidence: 'medium',
        reasoning: `Generic hireling type '${hirelingType}' with flat HP (implicit fighter)`,
        warnings
      };
    }
  }
  
  // Default: Has flat HP but unclear role
  warnings.push('Has flat HP but no clear class indicators - assuming classed NPC');
  return {
    type: 'classed',
    subtype: 'implicit-fighter',
    confidence: 'low',
    reasoning: 'Has flat HP without clear class/role indicators (default to fighter)',
    warnings
  };
}

/**
 * BRANCH 2B: Classifying a Monster/Unclassed Unit (HD path)
 */
function classifyMonster(
  creatureName: string,
  preCheck: PreCheckData,
  _canonicalData: CanonicalData
): ClassificationResult {
  const warnings: string[] = [];
  
  // 2B-1: Monster race from M&T?
  if (preCheck.isMonsterRace) {
    // 2B-3: Has leadership title but still monster
    if (preCheck.titleRank) {
      warnings.push(`Title '${preCheck.titleRank}' indicates leader role but remains monster (M&T chiefs use HD)`);
      return {
        type: 'monster',
        subtype: 'monster-leader',
        confidence: 'high',
        reasoning: `Monster race with HD and leadership title '${preCheck.titleRank}'`,
        warnings
      };
    }
    
    // 2B-2: Group unit?
    if (preCheck.isGroupUnit) {
      return {
        type: 'monster',
        subtype: 'monster-unit',
        confidence: 'high',
        reasoning: 'Monster race in group formation (plural track)',
        warnings
      };
    }
    
    return {
      type: 'monster',
      confidence: 'high',
      reasoning: 'Monster race from M&T using HD',
      warnings
    };
  }
  
  // 2B-4: Human/demi-human with HD (rare legacy case)
  if (preCheck.isHumanoidRace) {
    warnings.push('Humanoid race with HD (legacy format) - treated as unclassed monster, not fighter');
    return {
      type: 'monster',
      subtype: 'human-monster',
      confidence: 'medium',
      reasoning: 'Humanoid race with HD (old module format treating humans as monsters)',
      warnings
    };
  }
  
  // 2B-2: Group unit without clear race?
  if (preCheck.isGroupUnit) {
    return {
      type: 'monster',
      subtype: 'monster-unit',
      confidence: 'medium',
      reasoning: 'Group formation with HD (treated as monster unit)',
      warnings
    };
  }
  
  // 2B-3: Has title but unclear
  if (preCheck.titleRank) {
    warnings.push(`Title '${preCheck.titleRank}' present but no class indicators - assuming monster leader`);
    return {
      type: 'monster',
      subtype: 'monster-leader',
      confidence: 'low',
      reasoning: `Has HD and title '${preCheck.titleRank}' without class evidence`,
      warnings
    };
  }
  
  // Default: Has HD, no clear indicators
  warnings.push('Has HD but unclear race/type - defaulting to monster');
  return {
    type: 'monster',
    confidence: 'low',
    reasoning: 'Has HD without clear classification indicators (default to monster)',
    warnings
  };
}

/**
 * SPECIAL CASE 5.2: Named unique monsters
 * If creature has a proper name AND HD (not HP), it's still a monster
 * 
 * Proper names are things like:
 * - "Hub-Gub" (goblin king)
 * - "Wily Wil" (person)
 * - "Ember Raventree" (named NPC)
 * 
 * NOT common nouns like "Ape, carnivorous" or "Bat, giant"
 */
function checkNamedUniqueMonster(creatureName: string, preCheck: PreCheckData): boolean {
  // Don't apply this rule if already classified by other means
  if (!preCheck.hasHD || preCheck.hasFlatHP) {
    return false;
  }
  
  // Proper names typically:
  // - Don't have commas (which indicate common noun + descriptor)
  // - Have 2+ words where first is capitalized
  // - Are not in the monster type dictionary
  const hasComma = creatureName.includes(',');
  const hasDescriptorWords = /\b(giant|carnivorous|wild|black|wood|dire|young|ancient|elder|leader|raider)\b/i.test(creatureName);
  
  // If it has comma or descriptor words, it's likely a common noun, not proper name
  if (hasComma || hasDescriptorWords) {
    return false;
  }
  
  // Check if it's a known monster type
  if (isMonsterType(creatureName)) {
    return false;
  }
  
  // Now check if it looks like a proper name
  // Proper names: "Hub-Gub", "Wily Wil", "Ember Raventree"
  const hasProperName = /^[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*$/.test(creatureName);
  
  return hasProperName;
}

/**
 * Helper: Infer class from leadership title
 */
function inferClassFromTitle(title: string): string {
  const titleLower = title.toLowerCase();
  
  if (['priest', 'shaman', 'acolyte'].includes(titleLower)) {
    return 'cleric';
  }
  if (['captain', 'commander', 'sergeant', 'lieutenant'].includes(titleLower)) {
    return 'fighter';
  }
  if (['champion', 'warlord'].includes(titleLower)) {
    return 'fighter';
  }
  if (['elder', 'matron'].includes(titleLower)) {
    return 'cleric';
  }
  
  return 'fighter'; // Default inference
}

/**
 * MAIN ENTRY POINT: Classify creature using deterministic rule-tree
 */
export function classifyCreature(
  creatureName: string,
  canonicalData: CanonicalData
): ClassificationResult {
  // STEP 0: Pre-check
  const preCheck = extractPreCheckData(creatureName, canonicalData);
  
  // SPECIAL CASE 5.2: Named unique monster check
  if (checkNamedUniqueMonster(creatureName, preCheck)) {
    return {
      type: 'monster',
      confidence: 'high',
      reasoning: 'Named unique monster with HD (proper name does not grant class levels)',
      warnings: ['Named entity but uses HD - remains monster per rule 5.2']
    };
  }
  
  // STEP 1: Top-level split
  const { branch, warnings: splitWarnings } = applyTopLevelSplit(preCheck);
  
  // STEP 2: Branch-specific classification
  if (branch === '2A') {
    const result = classifyClassedNPC(creatureName, preCheck, canonicalData);
    result.warnings.push(...splitWarnings);
    return result;
  } else {
    const result = classifyMonster(creatureName, preCheck, canonicalData);
    result.warnings.push(...splitWarnings);
    return result;
  }
}

/**
 * Utility: Get formatting rules for a classified creature
 */
export interface FormattingRules {
  pronounTrack: 'singular' | 'plural';
  pronounThis: 'This' | 'These';
  pronounPossessive: 'his' | 'her' | 'their' | 'its';
  attributePhrasing: 'full-phb' | 'saves-notation';
  equipmentVerbs: 'carries-wears' | 'has-possesses';
  showLevel: boolean;
  showHD: boolean;
  useLevelOrdinal: boolean;
}

export function getFormattingRules(
  classification: ClassificationResult,
  preCheck: PreCheckData
): FormattingRules {
  const isMonster = classification.type === 'monster';
  const isUnit = preCheck.isGroupUnit || classification.subtype === 'monster-unit';
  
  return {
    pronounTrack: isMonster && isUnit ? 'plural' : 'singular',
    pronounThis: isMonster && isUnit ? 'These' : 'This',
    pronounPossessive: isMonster && isUnit ? 'their' : isMonster ? 'its' : 'his',
    attributePhrasing: isMonster ? 'saves-notation' : 'full-phb',
    equipmentVerbs: isMonster ? 'has-possesses' : 'carries-wears',
    showLevel: !isMonster && preCheck.hasLevel,
    showHD: isMonster && preCheck.hasHD,
    useLevelOrdinal: !isMonster && preCheck.hasLevel
  };
}
