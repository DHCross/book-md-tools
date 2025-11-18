/**
 * CANONICAL CLASSIFICATION RULE-TREE (Node.js Version)
 * 
 * Implements the deterministic classification system for C&C Reforged creatures.
 * This module resolves whether an entity is:
 * - Classed NPC (Format A - uses long-form attributes)
 * - Monster (Format B - uses shorthand physical/mental)
 * - Unit (Format C - uses shorthand with plural grammar)
 * 
 * Based on Version 3.0 Rule-Tree specification with 5-step priority hierarchy.
 * 
 * CONVERTED FROM: stat block submodule/classification-rules.ts
 */

/**
 * EXPANDED MONSTER-TYPE DICTIONARY
 * Built from C&C Monsters & Treasure (official M&T PDFs)
 */
const MONSTER_TYPE_DICTIONARY = {
  humanoids: [
    'orc', 'goblin', 'hobgoblin', 'gnoll', 'bugbear', 'kobold',
    'lizard man', 'lizardman', 'troglodyte', 'ogre', 'troll', 'ettin',
    'gnome', 'dwarf', 'elf', 'halfling', 'centaur',
    'satyr', 'minotaur', 'brownie'
  ],

  giants: [
    'hill giant', 'stone giant', 'frost giant', 'fire giant',
    'cloud giant', 'storm giant', 'cyclops', 'giant'
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

  undead: [
    'skeleton', 'zombie', 'ghoul', 'wight', 'wraith', 'mummy', 'spectre',
    'vampire', 'lich', 'ghost', 'shadow', 'banshee', 'revenant'
  ],

  extraplanar: [
    'demon', 'devil', 'angel', 'elemental', 'djinni', 'efreeti', 'dao', 'marid'
  ]
};

// Rank/title keywords that suggest classed NPC
const RANK_TITLES = new Set([
  'chieftain', 'captain', 'lieutenant', 'sergeant', 'corporal',
  'commander', 'general', 'major', 'colonel', 'leader', 'boss',
  'shaman', 'witch doctor', 'priest', 'elder', 'champion',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'baron', 'duke', 'count', 'earl', 'knight', 'sir'
]);

// PC-like humanoid races
const HUMANOID_RACES = new Set([
  'human', 'elf', 'dwarf', 'halfling', 'gnome', 'half-elf', 'half-orc'
]);

// Class keywords
const CLASS_KEYWORDS = new Set([
  'fighter', 'cleric', 'wizard', 'rogue', 'thief',
  'paladin', 'ranger', 'bard', 'druid', 'monk',
  'barbarian', 'assassin', 'illusionist', 'knight', 'magic-user'
]);

/**
 * SECTION 0: SIGNAL EXTRACTION (Version 3.0)
 * 
 * Extracts the six core signals required for classification hierarchy.
 */
function extractSignals(creatureName, canonicalData, context = {}) {
  const nameLower = creatureName.toLowerCase();
  const levelText = canonicalData.level || '';
  const raceClassText = context.raceClass || (levelText.includes('level') ? levelText : canonicalData.name) || '';
  const raceClassLower = raceClassText.toLowerCase();
  
  // Signal 1: HasSpells
  const HasSpells = Boolean(
    context.spells ||
    /(?:spellcaster|spellcasting)/i.test(raceClassText) ||
    /(?:can\s+cast|casts?\s+\d+|spells?\s+per\s+day|spell\s+slots?)/i.test(context.description || '')
  );
  
  // Signal 2: HasClassKeyword
  let HasClassKeyword = false;
  let detectedClassName;
  for (const className of CLASS_KEYWORDS) {
    if (raceClassLower.includes(className)) {
      HasClassKeyword = true;
      detectedClassName = className;
      break;
    }
  }
  
  // Signal 3: HasRankTitle
  let HasRankTitle = false;
  let detectedRankTitle;
  for (const title of RANK_TITLES) {
    if (nameLower.includes(title)) {
      HasRankTitle = true;
      detectedRankTitle = title;
      break;
    }
  }
  
  // Signal 4: IsNamed (Proper noun detection)
  const IsNamed = detectProperNoun(creatureName);
  
  // Signal 5: IsUnit (Numeration in header)
  const IsUnit = /\b(?:x\s*\d+|\d+\s*x|\(\d+\)|\d+-\d+)\b/i.test(creatureName) ||
                 /\b(?:bandits|goblins|orcs|guards|soldiers|kobolds|zombies|skeletons)\s+x\s*\d+\b/i.test(nameLower);
  
  // Signal 6: IsHumanoid
  let IsHumanoid = false;
  let detectedRace;
  
  for (const race of HUMANOID_RACES) {
    if (raceClassLower.includes(race) || nameLower.includes(race)) {
      IsHumanoid = true;
      detectedRace = race;
      break;
    }
  }
  
  // Special check for elf variants
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
 */
function detectProperNoun(creatureName) {
  if (creatureName.includes(',')) return false;
  if (isMonsterType(creatureName)) return false;
  
  const words = creatureName.split(/\s+/);
  let capitalizedWords = 0;
  
  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z]/g, '');
    if (clean && clean[0] === clean[0].toUpperCase() && clean.slice(1) === clean.slice(1).toLowerCase()) {
      capitalizedWords++;
    }
  }
  
  return capitalizedWords >= 2;
}

/**
 * Check if name matches any monster type
 */
function isMonsterType(name) {
  const lower = name.toLowerCase();
  for (const category of Object.values(MONSTER_TYPE_DICTIONARY)) {
    if (category.some(monster => lower.includes(monster))) {
      return true;
    }
  }
  return false;
}

/**
 * Extract pre-check data for disambiguation
 */
function extractPreCheckData(creatureName, canonicalData) {
  const hasHD = Boolean(canonicalData.hd || /\bHD\s+\d+/i.test(creatureName));
  const hasLevel = /\b\d+(?:st|nd|rd|th)\s+level\b/i.test(creatureName) || 
                   /\blevel\s+\d+\b/i.test(creatureName);
  const isMonsterRace = isMonsterType(creatureName);
  const isGroupUnit = /\bx\s*\d+|\d+\s*x|\(\d+\)|\d+-\d+/i.test(creatureName);
  
  return { hasHD, hasLevel, isMonsterRace, isGroupUnit };
}

/**
 * VERSION 3.0: 5-STEP CLASSIFICATION HIERARCHY
 * 
 * Priority (highest to lowest):
 * 1. HasSpells → Format A (Classed NPC - Spellcaster)
 * 2. HasClassKeyword OR HasRankTitle → Format A (Classed NPC)
 * 3. IsNamed AND IsHumanoid → Format A (Classed NPC - Named Humanoid)
 * 4. IsUnit → Format C (Unit)
 * 5. Default → Format B (Monster)
 */
function classifyEntityV3(creatureName, canonicalData, context = {}) {
  const signals = extractSignals(creatureName, canonicalData, context);
  const warnings = [];
  
  let format = 'B';
  let reasoning = 'Default to Monster';
  let legacyType = 'monster';
  let subtype;
  const confidence = 'high';
  let step = 5;
  
  const lowerName = creatureName.toLowerCase();
  const preCheck = extractPreCheckData(creatureName, canonicalData);
  
  // STEP 1: HasSpells (Highest Priority)
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
  // SPECIAL CASE: Bandit groups
  else if (signals.IsUnit && /\bbandit(s|\b|\s)/i.test(lowerName) && !signals.HasRankTitle) {
    format = 'C';
    step = 4;
    reasoning = 'Unit (bandit group override)';
    legacyType = 'monster';
    subtype = 'monster-unit';
  }
  // SPECIAL CASE: Solo bandits
  else if (/\bbandit\b/i.test(lowerName) && !signals.HasRankTitle && !signals.HasSpells && !signals.IsUnit) {
    format = 'B';
    step = 5;
    reasoning = 'Monster (bandit override)';
    legacyType = 'monster';
    subtype = 'monster';
  }
  // DISAMBIGUATION: HD/Level present
  else if (preCheck.hasHD || preCheck.hasLevel) {
    const levelLike = Boolean(preCheck.hasLevel) || /\b\d+(?:st|nd|rd|th)\s+level\b/i.test(String(canonicalData.level || context.raceClass || ''));
    const looksLikeMonsterEntry = preCheck.isMonsterRace || preCheck.isGroupUnit || levelLike;
    
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
    
    if (signals.IsNamed) {
      reasoning += ' (named non-humanoid)';
      subtype = 'named-creature';
    } else {
      subtype = 'monster';
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

// Export functions
module.exports = {
  extractSignals,
  classifyEntityV3,
  MONSTER_TYPE_DICTIONARY,
  CLASS_KEYWORDS,
  RANK_TITLES,
  HUMANOID_RACES
};
