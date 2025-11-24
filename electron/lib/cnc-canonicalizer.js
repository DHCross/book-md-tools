/**
 * C&C Reforged Stat Block Canonicalizer
 * 
 * Transforms stat blocks to canonical format according to:
 * - OGL Stat Reference Guide
 * - Canonical Classification Rule-Tree v3.0+
 */

const { classifyEntityV3 } = require('./cnc-classification-rules');
const { filterEntity, ENTITY_TYPES } = require('./cnc-entity-filter');

/**
 * Canonicalize a single stat block
 * 
 * @param {string} rawText - Original stat block text
 * @param {object} options - Transformation options
 * @returns {object} - { canonical: string, changes: array, confidence: string }
 */
function canonicalizeStatBlock(rawText, options = {}) {
  const changes = [];
  let text = rawText;
  
  // Extract name and parenthetical content
  const match = text.match(/\*\*([^*]+)\*\*\s*[_:]?\s*[_(]?([\s\S]*?)[_)]?$/);
  if (!match) {
    return { canonical: rawText, changes: [], confidence: 'failed', error: 'Could not parse stat block' };
  }
  
  let name = match[1].trim().replace(/:\s*$/, '');
  let content = match[2].trim();
  
  // PRE-FILTER: Check if this is actually a stat block
  const entityFilter = filterEntity(name, content);
  if (!entityFilter.isStatBlock) {
    return {
      canonical: rawText,
      changes: [],
      confidence: 'skipped',
      error: `Not a stat block: ${entityFilter.reason}`,
      entityType: entityFilter.type
    };
  }
  
  // Classify the entity
  const classification = classifyEntityV3(name, content);
  
  // Parse content into structured data
  const parsed = parseStatBlockContent(content);
  
  // Apply canonical transformations based on classification
  const canonical = buildCanonicalStatBlock(name, parsed, classification, changes);
  
  return {
    canonical,
    changes,
    confidence: classification.confidence,
    classification: classification.format
  };
}

/**
 * Parse stat block content into structured data
 */
function parseStatBlockContent(content) {
  const data = {
    hd: null,
    hp: null,
    ac: null,
    mv: null,
    disposition: null,
    attributes: null,
    abilities: [],
    equipment: [],
    treasure: [],
    attacks: [],
    xp: null,
    raw: content
  };
  
  // Extract HD/Level
  const hdMatch = content.match(/\b(?:HD|Level)\s*(\d+)\s*\(?\s*(d\d+)\)?/i);
  if (hdMatch) {
    data.hd = { count: hdMatch[1], die: hdMatch[2] };
  }
  
  // Extract HP
  const hpMatch = content.match(/\bHP\s*(\d+(?:\s+each)?)/i);
  if (hpMatch) {
    data.hp = hpMatch[1];
  }
  
  // Extract AC
  const acMatch = content.match(/\bAC\s*(\d+)/i);
  if (acMatch) {
    data.ac = acMatch[1];
  }
  
  // Extract MV
  const mvMatch = content.match(/\bMV\s*([\d\s,ft.]+)/i);
  if (mvMatch) {
    data.mv = mvMatch[1].trim();
  }
  
  // Extract disposition
  const dispMatch = content.match(/\b(?:disposition|aligned?)\s*([a-z/]+)/i);
  if (dispMatch) {
    data.disposition = dispMatch[1];
  }
  
  // Extract XP
  const xpMatch = content.match(/\bXP[:\s]*(\d+\s*[+]\s*\d+)/i);
  if (xpMatch) {
    data.xp = xpMatch[1];
  }
  
  return data;
}

/**
 * Build canonical stat block from parsed data
 */
function buildCanonicalStatBlock(name, data, classification, changes) {
  const parts = [];
  
  // Determine if plural
  const isPlural = /\b(?:x\s*\d+|\d+\s*x|,\s*\d+|patrol|squad|sentries|warriors?|guards?)\b/i.test(name);
  
  // Format name
  let canonicalName = name;
  // Convert "x 3" to ", 3" format
  canonicalName = canonicalName.replace(/\s+x\s+(\d+)/i, ', $1');
  
  // Build flow starter
  let flowStarter;
  if (classification.format === 'A') {
    // Classed NPC
    const levelMatch = data.raw.match(/(\d+)(?:st|nd|rd|th)\s+level/i);
    const level = levelMatch ? levelMatch[1] : '1';
    const classMatch = data.raw.match(/\b(fighter|wizard|cleric|rogue|ranger|paladin|barbarian|monk|druid|bard|illusionist|assassin|knight)\b/i);
    const className = classMatch ? classMatch[1].toLowerCase() : 'fighter';
    const raceMatch = data.raw.match(/\b(human|elf|dwarf|halfling|gnome|half-elf|half-orc)\b/i);
    const race = raceMatch ? raceMatch[1].toLowerCase() : 'human';
    
    if (isPlural) {
      flowStarter = `These ${level}${getOrdinalSuffix(level)} level ${race} ${className}s' vital stats are`;
    } else {
      flowStarter = `This ${level}${getOrdinalSuffix(level)} level ${race} ${className}'s vital stats are`;
    }
  } else {
    // Monster/Unit
    if (isPlural) {
      // Use humanoid noun override if applicable
      const baseCreature = name.replace(/[,\s]*\d+.*$/, '').toLowerCase();
      if (/bugbear|bandit|brigand|goblin|orc|kobold|gnoll|hobgoblin/i.test(baseCreature)) {
        flowStarter = `These ${baseCreature}s' vital stats are`;
      } else {
        flowStarter = `These creatures' vital stats are`;
      }
    } else {
      flowStarter = `This creature's vital stats are`;
    }
  }
  
  parts.push(flowStarter);
  
  // Add vitality
  const vitalityParts = [];
  
  // HD or Level notation
  if (data.hd) {
    if (classification.format === 'A') {
      // Classed NPCs don't use HD notation
      if (data.hp) {
        vitalityParts.push(`HP ${data.hp}`);
      }
    } else {
      // Determine HD vs Level based on taxonomy
      const isHumanoid = /bandit|brigand|bugbear|goblin|orc|kobold|gnoll|hobgoblin/i.test(name);
      const notation = isHumanoid ? 'HD' : 'Level';
      vitalityParts.push(`${notation} ${data.hd.count}(${data.hd.die})`);
      if (data.hp) {
        vitalityParts.push(`HP ${data.hp}`);
      }
    }
  } else if (data.hp) {
    vitalityParts.push(`HP ${data.hp}`);
  }
  
  if (data.ac) vitalityParts.push(`AC ${data.ac}`);
  if (data.mv) vitalityParts.push(`MV ${data.mv}`);
  
  // Disposition (noun form)
  if (data.disposition) {
    let disp = data.disposition.toLowerCase()
      .replace(/chaotic/g, 'chaos')
      .replace(/lawful/g, 'law')
      .replace(/neutral(?!ity)/g, 'neutrality')
      .replace(/good/g, 'good')
      .replace(/evil/g, 'evil');
    vitalityParts.push(`disposition ${disp}`);
  }
  
  parts.push(vitalityParts.join(', ') + '.');
  
  // Add attributes
  if (classification.format === 'A') {
    // Classed NPCs get full attribute list
    parts.push('Their primary attributes are strength, dexterity, and constitution.');
  } else if (isPlural) {
    // Units get placeholder
    parts.push('Their primary attributes are physical.');
  }
  // Singular monsters get NO attribute phrase
  
  // Add special abilities, equipment, treasure (preserve from original)
  // This is a simplified version - would need more sophisticated parsing
  
  // Add XP
  if (data.xp) {
    parts.push(`XP: ${data.xp.replace(/\s*\+\s*/g, ' + ')}.`);
  }
  
  // Build final canonical format
  const canonical = `**${canonicalName}:** (${parts.join(' ')})`;
  
  // Track changes
  if (canonical !== `**${name}:** (${data.raw})`) {
    changes.push({
      type: 'format',
      description: 'Applied canonical formatting',
      before: `**${name}:** (${data.raw})`,
      after: canonical
    });
  }
  
  return canonical;
}

function getOrdinalSuffix(num) {
  const n = parseInt(num);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Batch canonicalize multiple stat blocks
 */
function canonicalizeBatch(statBlocks, options = {}) {
  const results = [];
  
  for (const block of statBlocks) {
    const raw = block.raw || block.fullText || '';
    if (!raw) continue;
    
    const result = canonicalizeStatBlock(raw, options);
    results.push({
      ...block,
      ...result,
      original: raw
    });
  }
  
  return results;
}

module.exports = {
  canonicalizeStatBlock,
  canonicalizeBatch
};
