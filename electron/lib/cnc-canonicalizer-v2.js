/**
 * C&C Reforged Stat Block Canonicalizer V2
 * 
 * CONSERVATIVE APPROACH: Only fixes specific canonical violations
 * while preserving ALL original content (abilities, equipment, treasure, etc.)
 * 
 * Based on:
 * - OGL Stat Reference Guide
 * - Canonical Classification Rule-Tree v3.0+
 */

const { classifyEntityV3 } = require('./cnc-classification-rules');
const { filterEntity, ENTITY_TYPES } = require('./cnc-entity-filter');

/**
 * Canonicalize a single stat block
 * 
 * This function ONLY fixes:
 * 1. Flow starter ("This creature's" vs "These bugbears'" vs "This 2nd level human fighter's")
 * 2. Attribute phrasing (Class A gets full list, Units get "physical", singular monsters get NONE)
 * 3. Disposition format (noun forms: chaos/evil not chaotic evil)
 * 4. HD vs Level notation (humanoids use HD, animals use Level)
 * 5. XP spacing (20 + 3 not 20+3)
 * 
 * It PRESERVES:
 * - All abilities, special attacks, equipment, treasure
 * - All HP, AC, MV values
 * - All pronouns in body text
 * - All formatting (italics, parentheses)
 */
function canonicalizeStatBlock(rawText, options = {}) {
  const changes = [];
  
  // Extract name and parenthetical content
  const match = rawText.match(/\*\*([^*]+)\*\*\s*[_:]?\s*[_(]?([\s\S]*?)[_)]?$/);
  if (!match) {
    return {
      canonical: rawText,
      changes: [],
      confidence: 'failed',
      error: 'Could not parse stat block'
    };
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
  const classification = classifyEntityV3(name, { raw: content });
  
  // Apply targeted fixes
  let fixedContent = content;
  let fixedName = name;
  
  // FIX 1: Name format (x 3 → , 3)
  const nameFixResult = fixNameFormat(name);
  if (nameFixResult.changed) {
    fixedName = nameFixResult.fixed;
    changes.push({
      type: 'name_format',
      description: 'Normalized unit count format',
      before: name,
      after: fixedName
    });
  }
  
  // FIX 2: Flow starter
  const flowFixResult = fixFlowStarter(fixedContent, fixedName, classification);
  if (flowFixResult.changed) {
    fixedContent = flowFixResult.fixed;
    changes.push({
      type: 'flow_starter',
      description: flowFixResult.description,
      before: flowFixResult.before,
      after: flowFixResult.after
    });
  }
  
  // FIX 3: Attribute phrasing
  const attrFixResult = fixAttributePhrasing(fixedContent, fixedName, classification);
  if (attrFixResult.changed) {
    fixedContent = attrFixResult.fixed;
    changes.push({
      type: 'attributes',
      description: attrFixResult.description,
      before: attrFixResult.before,
      after: attrFixResult.after
    });
  }
  
  // FIX 4: Disposition format
  const dispFixResult = fixDisposition(fixedContent);
  if (dispFixResult.changed) {
    fixedContent = dispFixResult.fixed;
    changes.push({
      type: 'disposition',
      description: 'Converted to noun form',
      before: dispFixResult.before,
      after: dispFixResult.after
    });
  }
  
  // FIX 5: HD vs Level notation
  const hdFixResult = fixHDNotation(fixedContent, fixedName, classification);
  if (hdFixResult.changed) {
    fixedContent = hdFixResult.fixed;
    changes.push({
      type: 'hd_notation',
      description: hdFixResult.description,
      before: hdFixResult.before,
      after: hdFixResult.after
    });
  }
  
  // FIX 6: XP spacing
  const xpFixResult = fixXPSpacing(fixedContent);
  if (xpFixResult.changed) {
    fixedContent = xpFixResult.fixed;
    changes.push({
      type: 'xp_spacing',
      description: 'Normalized XP spacing',
      before: xpFixResult.before,
      after: xpFixResult.after
    });
  }
  
  // Build final canonical version
  const canonical = `**${fixedName}:** (${fixedContent})`;
  
  return {
    canonical,
    changes,
    confidence: classification.confidence,
    classification: classification.format,
    name: fixedName,
    original: rawText
  };
}

/**
 * FIX 1: Name format (x 3 → , 3)
 */
function fixNameFormat(name) {
  const fixed = name.replace(/\s+x\s+(\d+)/gi, ', $1');
  return {
    fixed,
    changed: fixed !== name
  };
}

/**
 * FIX 2: Flow starter
 */
function fixFlowStarter(content, name, classification) {
  // Detect current flow starter
  const flowMatch = content.match(/^(This|These)\s+([^']+)'s?\s+vital\s+stats\s+are/i);
  if (!flowMatch) {
    return { fixed: content, changed: false };
  }
  
  const currentFlow = flowMatch[0];
  const isPlural = /\b(?:x\s*\d+|\d+\s*x|,\s*\d+|patrol|squad|sentries|warriors?|guards?|bandits|goblins|orcs|kobolds|bugbears)\b/i.test(name);
  
  let correctFlow;
  
  if (classification.format === 'A') {
    // Classed NPC - extract level/class/race from content
    const levelMatch = content.match(/(\d+)(?:st|nd|rd|th)\s+level/i);
    const level = levelMatch ? levelMatch[1] : '1';
    const classMatch = content.match(/\b(fighter|wizard|cleric|rogue|ranger|paladin|barbarian|monk|druid|bard|illusionist|assassin|knight)\b/i);
    const className = classMatch ? classMatch[1].toLowerCase() : 'fighter';
    const raceMatch = content.match(/\b(human|elf|dwarf|halfling|gnome|half-elf|half-orc)\b/i);
    const race = raceMatch ? raceMatch[1].toLowerCase() : 'human';
    
    const ordinal = getOrdinalSuffix(level);
    
    if (isPlural) {
      correctFlow = `These ${level}${ordinal} level ${race} ${className}s' vital stats are`;
    } else {
      correctFlow = `This ${level}${ordinal} level ${race} ${className}'s vital stats are`;
    }
  } else {
    // Monster/Unit
    if (isPlural) {
      // Use humanoid noun override
      const baseCreature = name.replace(/[,\s]*\d+.*$/, '').trim().toLowerCase();
      const humanoidMatch = baseCreature.match(/\b(bugbear|bandit|brigand|goblin|orc|kobold|gnoll|hobgoblin|ogre|troll)\b/i);
      
      if (humanoidMatch) {
        const creatureType = humanoidMatch[1].toLowerCase();
        correctFlow = `These ${creatureType}s' vital stats are`;
      } else {
        correctFlow = `These creatures' vital stats are`;
      }
    } else {
      correctFlow = `This creature's vital stats are`;
    }
  }
  
  if (currentFlow === correctFlow) {
    return { fixed: content, changed: false };
  }
  
  const fixed = content.replace(currentFlow, correctFlow);
  return {
    fixed,
    changed: true,
    description: `Changed flow starter to canonical form`,
    before: currentFlow,
    after: correctFlow
  };
}

/**
 * FIX 3: Attribute phrasing
 */
function fixAttributePhrasing(content, name, classification) {
  const isPlural = /\b(?:x\s*\d+|\d+\s*x|,\s*\d+|patrol|squad|sentries|warriors?|guards?)\b/i.test(name);
  
  // Look for existing attribute phrases
  const attrPatterns = [
    /\b(?:Their|His|Her|Its)\s+(?:primary\s+)?attributes?\s+are\s+([^.]+)\./i,
    /\b(?:Their|His|Her|Its)\s+saves?\s+are\s+([^.]+)\./i
  ];
  
  let currentAttr = null;
  let currentAttrMatch = null;
  
  for (const pattern of attrPatterns) {
    const match = content.match(pattern);
    if (match) {
      currentAttr = match[0];
      currentAttrMatch = match;
      break;
    }
  }
  
  let correctAttr;
  
  if (classification.format === 'A') {
    // Classed NPCs get full list
    correctAttr = 'Their primary attributes are strength, dexterity, and constitution.';
  } else if (isPlural) {
    // Units get placeholder
    correctAttr = 'Their primary attributes are physical.';
  } else {
    // Singular monsters get NONE - remove it
    if (currentAttr) {
      const fixed = content.replace(currentAttr, '').replace(/\s+/g, ' ').trim();
      return {
        fixed,
        changed: true,
        description: 'Removed attribute phrase (singular monsters have none)',
        before: currentAttr,
        after: '(removed)'
      };
    }
    return { fixed: content, changed: false };
  }
  
  if (!currentAttr) {
    // Need to insert attribute phrase after vitality
    const vitalityMatch = content.match(/(disposition\s+[^.]+\.)/i);
    if (vitalityMatch) {
      const insertPoint = vitalityMatch.index + vitalityMatch[0].length;
      const fixed = content.slice(0, insertPoint) + ' ' + correctAttr + content.slice(insertPoint);
      return {
        fixed,
        changed: true,
        description: 'Added missing attribute phrase',
        before: '(missing)',
        after: correctAttr
      };
    }
    return { fixed: content, changed: false };
  }
  
  if (currentAttr === correctAttr) {
    return { fixed: content, changed: false };
  }
  
  const fixed = content.replace(currentAttr, correctAttr);
  return {
    fixed,
    changed: true,
    description: 'Corrected attribute phrasing',
    before: currentAttr,
    after: correctAttr
  };
}

/**
 * FIX 4: Disposition format (adjective → noun)
 */
function fixDisposition(content) {
  const dispMatch = content.match(/\b(?:disposition|aligned?)\s+([a-z/\s]+?)(?:\.|,)/i);
  if (!dispMatch) {
    return { fixed: content, changed: false };
  }
  
  const currentDisp = dispMatch[1].trim();
  let fixedDisp = currentDisp
    .replace(/\bchaotic\b/gi, 'chaos')
    .replace(/\blawful\b/gi, 'law')
    .replace(/\bneutral\b(?!\s*\/)/gi, 'neutrality')
    .replace(/\bgood\b/gi, 'good')
    .replace(/\bevil\b/gi, 'evil');
  
  if (currentDisp === fixedDisp) {
    return { fixed: content, changed: false };
  }
  
  const fixed = content.replace(dispMatch[0], dispMatch[0].replace(currentDisp, fixedDisp));
  return {
    fixed,
    changed: true,
    before: currentDisp,
    after: fixedDisp
  };
}

/**
 * FIX 5: HD vs Level notation
 */
function fixHDNotation(content, name, classification) {
  const hdMatch = content.match(/\b(HD|Level)\s+(\d+)\s*\(?\s*(d\d+)\)?/i);
  if (!hdMatch) {
    return { fixed: content, changed: false };
  }
  
  const currentNotation = hdMatch[1];
  const count = hdMatch[2];
  const die = hdMatch[3];
  
  // Determine correct notation
  const isHumanoid = /bandit|brigand|bugbear|goblin|orc|kobold|gnoll|hobgoblin|ogre|troll/i.test(name);
  const correctNotation = isHumanoid ? 'HD' : 'Level';
  
  if (currentNotation.toLowerCase() === correctNotation.toLowerCase()) {
    // Check format: should be "HD 3(d10)" not "HD 3d10"
    const correctFormat = `${correctNotation} ${count}(${die})`;
    const currentFormat = hdMatch[0];
    
    if (currentFormat !== correctFormat) {
      const fixed = content.replace(currentFormat, correctFormat);
      return {
        fixed,
        changed: true,
        description: 'Fixed HD/Level format',
        before: currentFormat,
        after: correctFormat
      };
    }
    
    return { fixed: content, changed: false };
  }
  
  const correctFormat = `${correctNotation} ${count}(${die})`;
  const fixed = content.replace(hdMatch[0], correctFormat);
  return {
    fixed,
    changed: true,
    description: `Changed ${currentNotation} to ${correctNotation}`,
    before: hdMatch[0],
    after: correctFormat
  };
}

/**
 * FIX 6: XP spacing (20+3 → 20 + 3)
 */
function fixXPSpacing(content) {
  const xpMatch = content.match(/\bXP[:\s]*(\d+)\s*([+])\s*(\d+)/i);
  if (!xpMatch) {
    return { fixed: content, changed: false };
  }
  
  const current = xpMatch[0];
  const correct = `XP: ${xpMatch[1]} + ${xpMatch[3]}`;
  
  if (current === correct) {
    return { fixed: content, changed: false };
  }
  
  const fixed = content.replace(current, correct);
  return {
    fixed,
    changed: true,
    before: current,
    after: correct
  };
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
      ...result
    });
  }
  
  return results;
}

module.exports = {
  canonicalizeStatBlock,
  canonicalizeBatch
};
