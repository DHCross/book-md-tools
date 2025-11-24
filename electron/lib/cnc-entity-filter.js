/**
 * C&C Entity Type Pre-Filter
 * 
 * Filters out non-stat-block entities BEFORE classification.
 * Prevents places, items, traps, terrain, tables, and other non-creatures
 * from being processed as stat blocks.
 * 
 * This is the FIRST gate before any canonicalization happens.
 */

/**
 * Entity type constants
 */
const ENTITY_TYPES = {
  STAT_BLOCK: 'stat_block',      // Valid creature/NPC stat block
  PLACE: 'place',                 // Location, terrain, area
  ITEM: 'item',                   // Magic item, gear, treasure
  POTION: 'potion',               // Potion or consumable
  SCROLL: 'scroll',               // Scroll or written item
  TRAP: 'trap',                   // Trap or hazard
  TABLE: 'table',                 // Reference table
  TREASURE: 'treasure',           // Treasure hoard
  META: 'meta',                   // Boxed text, headers, markers
  UNKNOWN: 'unknown'              // Cannot determine
};

/**
 * Place/terrain/location keywords
 */
const PLACE_KEYWORDS = [
  // Terrain
  'river', 'stream', 'lake', 'pond', 'ocean', 'sea',
  'mountain', 'hill', 'valley', 'ravine', 'canyon', 'cliff', 'bluff',
  'forest', 'wood', 'grove', 'thicket', 'jungle',
  'plain', 'field', 'meadow', 'grassland',
  'swamp', 'marsh', 'bog', 'fen',
  'desert', 'wasteland', 'tundra',
  'cave', 'cavern', 'grotto', 'den', 'lair',
  
  // Paths/routes
  'road', 'path', 'trail', 'track', 'route', 'way',
  'bridge', 'ford', 'crossing',
  
  // Structures
  'castle', 'tower', 'keep', 'fortress', 'citadel',
  'temple', 'shrine', 'church', 'cathedral',
  'dungeon', 'crypt', 'tomb', 'vault',
  'room', 'chamber', 'hall', 'corridor', 'passage',
  'area', 'section', 'zone', 'region',
  'gate', 'door', 'entrance', 'exit',
  'pier', 'dock', 'wharf', 'harbor',
  
  // Meta locations
  'north', 'south', 'east', 'west',
  'upper', 'lower', 'inner', 'outer'
];

/**
 * Item type keywords
 */
const ITEM_KEYWORDS = [
  // Weapons
  'sword', 'axe', 'mace', 'hammer', 'flail', 'spear', 'lance',
  'dagger', 'knife', 'blade',
  'bow', 'crossbow', 'sling',
  'staff', 'wand', 'rod',
  
  // Armor
  'armor', 'mail', 'plate', 'leather', 'hide',
  'shield', 'buckler',
  'helm', 'helmet', 'gauntlet', 'boot',
  
  // Magic items
  'ring of', 'amulet of', 'cloak of', 'boots of',
  'bracers of', 'belt of', 'gloves of',
  'bag of', 'deck of', 'horn of', 'rope of',
  
  // Gear
  'torch', 'lantern', 'rope', 'chain',
  'backpack', 'sack', 'pouch', 'chest', 'coffer',
  'key', 'lock', 'tool'
];

/**
 * Potion/consumable patterns
 */
const POTION_PATTERNS = [
  /^potion of/i,
  /^elixir of/i,
  /^philter of/i,
  /^oil of/i,
  /^salve of/i,
  /^unguent of/i
];

/**
 * Scroll/written item patterns
 */
const SCROLL_PATTERNS = [
  /^scroll of/i,
  /^tome of/i,
  /^book of/i,
  /^manual of/i,
  /^grimoire of/i,
  /^libram of/i
];

/**
 * Trap/hazard keywords
 */
const TRAP_KEYWORDS = [
  'trap', 'snare', 'pit', 'spike', 'blade',
  'poison', 'gas', 'acid', 'fire trap',
  'alarm', 'ward', 'glyph', 'rune trap',
  'tripwire', 'pressure plate', 'hidden'
];

/**
 * Table/reference keywords
 */
const TABLE_KEYWORDS = [
  'table', 'chart', 'list', 'index',
  'appendix', 'reference', 'sidebar'
];

/**
 * Meta/formatting keywords
 */
const META_KEYWORDS = [
  'boxed text', 'begin boxed', 'end boxed',
  'read aloud', 'dm note', 'gm note',
  'chapter', 'part', 'section',
  'header', 'footer', 'title'
];

/**
 * Treasure keywords
 */
const TREASURE_KEYWORDS = [
  'treasure', 'hoard', 'loot', 'coins',
  'gold pieces', 'silver pieces', 'copper pieces',
  'platinum pieces', 'electrum pieces',
  'gp', 'sp', 'cp', 'pp', 'ep',
  'gems', 'jewelry', 'art objects'
];

/**
 * Check if name matches place/terrain
 */
function isPlace(name) {
  const lower = name.toLowerCase();
  
  // Check for explicit place keywords
  for (const keyword of PLACE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for room numbers (e.g., "Room 4", "Area 12")
  if (/\b(?:room|area|chamber|hall)\s*\d+/i.test(name)) {
    return true;
  }
  
  // Check for directional markers
  if (/\b(?:north|south|east|west|upper|lower)\s+(?:room|area|chamber|hall|section)/i.test(name)) {
    return true;
  }
  
  return false;
}

/**
 * Check if name matches item/gear
 */
function isItem(name) {
  const lower = name.toLowerCase();
  
  // Check for explicit item keywords
  for (const keyword of ITEM_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for magic item patterns ("+1", "+2", etc.)
  if (/[+]\d+/.test(name)) {
    return true;
  }
  
  return false;
}

/**
 * Check if name matches potion/consumable
 */
function isPotion(name) {
  for (const pattern of POTION_PATTERNS) {
    if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if name matches scroll/written item
 */
function isScroll(name) {
  for (const pattern of SCROLL_PATTERNS) {
    if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if name matches trap/hazard
 */
function isTrap(name) {
  const lower = name.toLowerCase();
  
  for (const keyword of TRAP_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if name matches table/reference
 */
function isTable(name) {
  const lower = name.toLowerCase();
  
  for (const keyword of TABLE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for "Table X" pattern
  if (/\btable\s+\d+/i.test(name)) {
    return true;
  }
  
  return false;
}

/**
 * Check if name matches meta/formatting marker
 */
function isMeta(name) {
  const lower = name.toLowerCase();
  
  for (const keyword of META_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for boxed text markers
  if (/^(?:>>|<<|begin|end)/i.test(name)) {
    return true;
  }
  
  return false;
}

/**
 * Check if name matches treasure
 */
function isTreasure(name) {
  const lower = name.toLowerCase();
  
  for (const keyword of TREASURE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for coin amounts (e.g., "500 gp", "2d6 sp")
  if (/\d+\s*(?:gp|sp|cp|pp|ep)\b/i.test(name)) {
    return true;
  }
  
  return false;
}

/**
 * Main filter function - determines entity type
 * 
 * @param {string} name - Entity name from heading
 * @param {string} content - Content within parentheses (optional)
 * @returns {object} - { type: ENTITY_TYPES.*, isStatBlock: boolean, reason: string }
 */
function filterEntity(name, content = '') {
  // Priority order (highest to lowest):
  // 1. Meta markers (boxed text, etc.)
  // 2. Tables/references
  // 3. Places/terrain
  // 4. Traps
  // 5. Potions
  // 6. Scrolls
  // 7. Items/gear
  // 8. Treasure
  // 9. Default to stat block
  
  if (isMeta(name)) {
    return {
      type: ENTITY_TYPES.META,
      isStatBlock: false,
      reason: 'Meta/formatting marker detected'
    };
  }
  
  if (isTable(name)) {
    return {
      type: ENTITY_TYPES.TABLE,
      isStatBlock: false,
      reason: 'Table/reference detected'
    };
  }
  
  if (isPlace(name)) {
    return {
      type: ENTITY_TYPES.PLACE,
      isStatBlock: false,
      reason: 'Place/terrain/location detected'
    };
  }
  
  if (isTrap(name)) {
    return {
      type: ENTITY_TYPES.TRAP,
      isStatBlock: false,
      reason: 'Trap/hazard detected'
    };
  }
  
  if (isPotion(name)) {
    return {
      type: ENTITY_TYPES.POTION,
      isStatBlock: false,
      reason: 'Potion/consumable detected'
    };
  }
  
  if (isScroll(name)) {
    return {
      type: ENTITY_TYPES.SCROLL,
      isStatBlock: false,
      reason: 'Scroll/written item detected'
    };
  }
  
  if (isItem(name)) {
    return {
      type: ENTITY_TYPES.ITEM,
      isStatBlock: false,
      reason: 'Item/gear detected'
    };
  }
  
  if (isTreasure(name)) {
    return {
      type: ENTITY_TYPES.TREASURE,
      isStatBlock: false,
      reason: 'Treasure detected'
    };
  }
  
  // Default: assume it's a stat block
  return {
    type: ENTITY_TYPES.STAT_BLOCK,
    isStatBlock: true,
    reason: 'Passed all filters - appears to be a stat block'
  };
}

module.exports = {
  filterEntity,
  ENTITY_TYPES,
  isPlace,
  isItem,
  isPotion,
  isScroll,
  isTrap,
  isTable,
  isMeta,
  isTreasure
};
