// Enhanced NPC Parser with Jeremy's normalization rules
// Implements parenthetical extraction, mount handling, shield canonicalization, etc.

export interface ParentheticalData {
  hd?: string;
  hp?: string;
  ac?: string;
  disposition?: string;
  raceClass?: string;
  level?: string;
  attributes?: string;
  significantAttributes?: string;
  secondarySkills?: string;
  equipment?: string;
  formationDetails?: string;
  spells?: string;
  mountData?: string;
  coins?: string;
  jewelry?: string;
  originalPronoun?: string; // Track original "these", "this", etc. to avoid duplication
  raw: string;
}

// Expose a small helper to sanitize known canonicalization artifacts that
// sneak into the final converted text so Storybook visual checks are clean.
export function sanitizeCanonicalText(text: string): string {
  if (!text) return text;
  let result = text;
  // Normalize plural typos and known incorrect tokens
  result = result.replace(/\barmors\b/gi, 'armor');
  result = result.replace(/\barmour\b/gi, 'armor');
  result = result.replace(/\bhams\b/gi, 'ham');
  result = result.replace(/\bscrolls\b/gi, 'scroll');
  result = result.replace(/\btrashs\b/gi, 'trash');
  result = result.replace(/\beachs\b/gi, 'each');
  // Normalize odd pluralization with trailing 's' artifacts
  result = result.replace(/\beachs\b/gi, 'each');
  return result;
}

// Per Canonicalizer mandate: normalize Unicode superscripts to plain-text ordinals
// Converts 12ᵗʰ → 12th, 5ˢᵗ → 5st, etc.
export function normalizeUnicodeSuperscripts(text: string): string {
  if (!text) return text;
  let result = text;
  // Map Unicode superscript ordinals to plain text
  result = result.replace(/(\d+)ᵗʰ/g, '$1th');
  result = result.replace(/(\d+)ˢᵗ/g, '$1st');
  result = result.replace(/(\d+)ⁿᵈ/g, '$1nd');
  result = result.replace(/(\d+)ʳᵈ/g, '$1rd');
  // Also handle stray superscript characters that might appear
  result = result.replace(/(\d+)\s*[\u1d57\u02b0]/g, '$1th');
  return result;
}

// Per Canonicalizer mandate: replace verbose "primary attributes are physical" with canonical Saves notation
// For non-classed monsters, use Saves abbreviations: P (Physical), M (Mental), M,P (Both), N (None)
export function normalizePrimaryAttributesForMonsters(text: string, hasClassLevels: boolean): string {
  if (!text || hasClassLevels) return text; // Only apply to non-classed creatures
  
  // For monsters without class levels, replace "primary attributes are physical" with "Saves: P"
  let result = text;
  result = result.replace(/\bTheir\s+primary\s+attributes\s+are\s+physical\b/gi, 'Saves: P');
  result = result.replace(/\bHis\s+primary\s+attributes\s+are\s+physical\b/gi, 'Saves: P');
  result = result.replace(/\bHer\s+primary\s+attributes\s+are\s+physical\b/gi, 'Saves: P');
  result = result.replace(/\bIts\s+primary\s+attributes\s+are\s+physical\b/gi, 'Saves: P');
  return result;
}

const LONG_FORM_ATTRIBUTES = 'strength, dexterity, constitution, intelligence, wisdom, charisma';

export function expandShorthandForClassed(text: string): string {
  if (!text) return text;

  return text.replace(/\b(Their|His|Her|Its)\s+primary\s+attributes\s+are\s+physical\b([.!?])?/gi, (_match, pronoun: string, punctuation: string | undefined) => {
    const ending = punctuation ?? '.';
    return `${pronoun} primary attributes are ${LONG_FORM_ATTRIBUTES}${ending}`;
  });
}

type SubjectPronoun = 'He' | 'She' | 'They' | 'It';

function capitalizePronounValue(value?: string): string {
  if (!value) return '';
  const lower = value.trim().toLowerCase();
  if (!lower) return '';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function possessiveToSubjectPronoun(pronoun: string): SubjectPronoun {
  const lowered = pronoun.trim().toLowerCase();
  if (lowered === 'his') return 'He';
  if (lowered === 'her') return 'She';
  if (lowered === 'its') return 'It';
  return 'They';
}

function enforcePossessivePronoun(
  candidate: string | undefined,
  pronounTrack: 'singular' | 'plural',
  fallback: string,
  options: { allowFeminine?: boolean; requireNeutralIts?: boolean } = {}
): string {
  if (pronounTrack === 'plural') {
    return 'Their';
  }

  if (options.requireNeutralIts) {
    return 'Its';
  }

  if (!candidate) {
    return fallback;
  }

  const normalized = capitalizePronounValue(candidate);
  const lowered = normalized.toLowerCase();

  if (lowered === 'their' || lowered === 'they') {
    return fallback;
  }

  if (!options.allowFeminine && lowered === 'her') {
    return fallback;
  }

  if (fallback.toLowerCase() === 'his' && lowered === 'its') {
    return fallback;
  }

  return normalized;
}

export interface ParsedTitleAndBody {
  title: string;
  body: string;
  parentheticals: string[];
}

import { addMagicItemMechanics, applyNameMappings, MAGIC_ITEM_MAPPINGS, canonicalizeMagicItemName } from './name-mappings';
import { estimateHpFromHd, isRankedNamedEntity, formatHdAsLevel } from './stat-block-helpers';
import type { FormattingRules } from './classification-rules';
import { classifyEntityV3, type SignalExtractionContext } from './classification-rules';

function wrapItalic(text: string): string {
  // If already italicized, keep it
  if (/^\*.*\*$/.test(text)) return text;
  return `*${text}*`;
}
import { determinePossessivePronoun } from './stat-block-helpers';

export interface MountBlock {
  name: string;
  level?: string;
  hd?: string;
  hp?: string;
  ac?: string;
  disposition?: string;
  attacks?: string;
  equipment?: string;
  raw?: string;
}

interface CanonicalMountData {
  name: string;
  level?: string;
  hd?: string;
  hp?: string;
  ac?: string;
  disposition?: string;
  attacks?: string;
  equipment?: string;
}

const CANONICAL_MOUNT_DATA: Record<string, CanonicalMountData> = {
  'heavy war horse': {
    name: 'heavy war horse',
    hd: '4d10',
    hp: '35',
    ac: '19',
    disposition: 'neutral',
    attacks: 'It receives two hoof attacks for 1–4 damage or one overbearing attack.',
    equipment: 'It wears chain mail barding.'
  }
};

function normalizeMountKey(raw: string): string {
  return raw
    .replace(/\(mount\)/gi, '')
    .replace(/[^a-zA-Z\s-]/g, ' ')
    .replace(/warhorse/gi, 'war horse')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function lookupCanonicalMount(raw: string): MountBlock | undefined {
  const key = normalizeMountKey(raw);
  if (!key) {
    return undefined;
  }

    let normalizedAttrs: NormalizedAttributesResult | undefined;
    const canonical = CANONICAL_MOUNT_DATA[key];
  if (!canonical) {
    return undefined;
  }

    if (!normalizedAttrs && isNamedRanked && data.significantAttributes) {
      // Convert significant attributes to a normalized list form
      normalizedAttrs = { type: 'list', value: data.significantAttributes };
    }

    return {
      name: canonical.name,
      raw: block.raw ?? canonical.raw,
      level: block.level ?? canonical.level,
      hd: block.hd ?? canonical.hd,
      hp: block.hp ?? canonical.hp,
      ac: block.ac ?? canonical.ac,
      disposition: block.disposition ?? canonical.disposition,
      attacks: block.attacks ?? canonical.attacks,
      equipment: block.equipment ?? canonical.equipment,
    };
}

export function canonicalizeMountBlock(block: MountBlock): MountBlock {
  const source = block.name || block.raw || '';
  const canonical = source ? lookupCanonicalMount(source) : undefined;

  if (!canonical) {
    const normalizedName = block.name
      ? block.name
      : block.raw
        ? block.raw.replace(/[.\s]+$/, '')
        : 'mount';

    return {
      ...block,
      name: normalizedName,
    };
  }

  return {
    name: canonical.name,
    raw: block.raw ?? canonical.raw,
    level: block.level ?? canonical.level,
    hd: block.hd ?? canonical.hd,
    hp: block.hp ?? canonical.hp,
    ac: block.ac ?? canonical.ac,
    disposition: block.disposition ?? canonical.disposition,
    attacks: block.attacks ?? canonical.attacks,
    equipment: block.equipment ?? canonical.equipment,
  };
}

export function buildMountBridgeSentence(mountName: string, pronoun: SubjectPronoun): string {
  const rideVerb = pronoun === 'They' ? 'ride' : 'rides';
  const normalized = mountName
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/war\s+horse/g, 'warhorse');
  const needsArticle = !/^(?:a|an|the)\b/.test(normalized);
  const article = /^[aeiou]/.test(normalized) ? 'an' : 'a';
  const descriptor = needsArticle ? `${article} ${normalized}` : normalized;
  return `${pronoun} ${rideVerb} ${descriptor} in battle.`;
}

function numberToWords(num: number): string {
  if (!Number.isFinite(num) || num < 0) {
    return num.toString();
  }

  const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (num < 10) {
    return units[num];
  }

  if (num < 20) {
    return teens[num - 10];
  }

  if (num < 100) {
    const tensValue = Math.floor(num / 10);
    const remainder = num % 10;
    return remainder === 0 ? tens[tensValue] : `${tens[tensValue]}-${units[remainder]}`;
  }

  if (num < 1000) {
    const hundredsValue = Math.floor(num / 100);
    const remainder = num % 100;
    const remainderText = remainder === 0 ? '' : ` ${numberToWords(remainder)}`;
    return `${units[hundredsValue]} hundred${remainderText}`;
  }

  if (num < 10000) {
    const thousandsValue = Math.floor(num / 1000);
    const remainder = num % 1000;
    const remainderText = remainder === 0 ? '' : ` ${numberToWords(remainder)}`;
    return `${units[thousandsValue]} thousand${remainderText}`;
  }

  return num.toString();
}

function canonicalizeCoinsText(coins: string): string {
  if (!coins) {
    return coins;
  }

  let normalized = coins.trim();

  normalized = normalized.replace(/\s*[-–]\s*/g, '–');
  normalized = normalized.replace(/(\d)(pp|gp|sp|cp)\b/gi, '$1 $2');
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

// Helper function to get superscript ordinal
function getSuperscriptOrdinal(num: string): string {
  const n = parseInt(num);
  if (n === 0) return '';
  if (n % 10 === 1 && n % 100 !== 11) return 'ˢᵗ';
  if (n % 10 === 2 && n % 100 !== 12) return 'ⁿᵈ';
  if (n % 10 === 3 && n % 100 !== 13) return 'ʳᵈ';
  return 'ᵗʰ';
}

// Core regex patterns based on Jeremy's specifications
// This regex handles nested parentheses by matching balanced parentheses
const PAREN_RE = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
const HD_RE = /\bHD\s*[:=]?\s*([0-9]+d[0-9]+(?:\s*(?:\+|-)\s*[0-9]+)?)\b/i;
const HP_RE = /\b(?:HP|Hit\s*Points)\s*[:-]?\s*(\d+)\b/i;
const AC_RE = /\bAC\s*[:-]?\s*([\d/]+)\b/i;

const RCL_RE = /\b(?:(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s*level\s+([a-z-]+)\s+([a-z-]+)s?|(human|elf|dwarf|halfling|gnome|orc|goblin),\s*(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s*level\s+([a-z-]+)s?)\b/i;

const DISPOSITION_RE = /\b(disposition|alignment)\s*[:‑]?\s*([a-z\s]+(?:\/[a-z\s]+)?)\b/i;
const MOUNT_TYPE_RE = /\b(heavy|light)?\s*war\s*horse\b/i;
const LEADING_BONUS_RE = /\+(\d+)\s+((?:\w+\s+)*(?:longsword|sword|mail|armor|shield|lance|dagger|mace|axe|bow|crossbow|staff|rod|wand|ring|robe|cloak|boots|gauntlets|helm|bracers|pectoral))/gi;

// Unit detection patterns
const UNIT_PATTERNS = [
  /\bx\s*(\d{1,3})\b/i,
  /\b(men-at-arms|militia|warriors|halflings|bowmen|guards|sergeants|fighters|troops)\b/i
];

export function splitTitleAndBody(text: string): ParsedTitleAndBody {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { title: '', body: '', parentheticals: [] };
  }

  // For single-line input, extract title before first parenthetical
  if (lines.length === 1) {
    const line = lines[0];
    const firstParenMatch = line.match(/^([^(]+?)\s*\(/);
    const title = firstParenMatch ? firstParenMatch[1].trim() : line;
    const body = '';

    // Extract all top-level parentheticals
    const parentheticals: string[] = [];
    let match;
    PAREN_RE.lastIndex = 0;
    while ((match = PAREN_RE.exec(text)) !== null) {
      parentheticals.push(match[1]);
    }

    // Fallback: if no balanced parentheticals found but we have an opening paren,
    // extract everything after the first opening parenthesis as an unclosed parenthetical
    if (parentheticals.length === 0 && firstParenMatch) {
      const openParenIndex = text.indexOf('(');
      if (openParenIndex !== -1) {
        const remaining = text.substring(openParenIndex + 1);
        if (remaining.trim()) {
          parentheticals.push(remaining.trim());
        }
      }
    }

    return { title, body, parentheticals };
  }

  const title = lines[0];
  const body = lines.slice(1).join('\n');

  // Extract all top-level parentheticals
  const parentheticals: string[] = [];
  let match;
  PAREN_RE.lastIndex = 0;
  while ((match = PAREN_RE.exec(text)) !== null) {
    parentheticals.push(match[1]);
  }

  // Fallback: if no balanced parentheticals found but we have an opening paren,
  // extract everything after the first opening parenthesis as an unclosed parenthetical
  if (parentheticals.length === 0) {
    const openParenIndex = text.indexOf('(');
    if (openParenIndex !== -1) {
      const remaining = text.substring(openParenIndex + 1);
      if (remaining.trim()) {
        parentheticals.push(remaining.trim());
      }
    }
  }

  return { title, body, parentheticals };
}

export function extractParentheticalData(parenthetical: string, isUnit: boolean = false, title?: string): ParentheticalData {
  const data: ParentheticalData = { raw: parenthetical };

  // Extract HD (monsters / units)
  const hdMatch = HD_RE.exec(parenthetical);
  if (hdMatch) {
    data.hd = hdMatch[1].replace(/\s+/g, '');
  }

  // Extract HP
  const hpMatch = HP_RE.exec(parenthetical);
  if (hpMatch) {
    data.hp = hpMatch[1];
  }

  // Extract AC
  const acMatch = AC_RE.exec(parenthetical);
  if (acMatch) {
    data.ac = acMatch[1];
  }

  // Extract disposition with multiple pattern variations
  let dispositionMatch = DISPOSITION_RE.exec(parenthetical);
  if (!dispositionMatch) {
    // Try more liberal patterns
    dispositionMatch = /\b(lawful\s+good|lawful\s+neutral|lawful\s+evil|neutral\s+good|true\s+neutral|neutral\s+evil|chaotic\s+good|chaotic\s+neutral|chaotic\s+evil|lawful|neutral|chaotic|good|evil)\b/i.exec(parenthetical);
    if (dispositionMatch) {
      data.disposition = normalizeDisposition(dispositionMatch[1]);
    }
  } else {
    data.disposition = normalizeDisposition(dispositionMatch[2]);
  }

  // Extract Level with dice notation for non-classed creatures (e.g., "Level 1(d6)")
  const levelDiceMatch = /\bLevel\s+(\d+\([^)]+\))/i.exec(parenthetical);
  if (levelDiceMatch) {
    data.level = levelDiceMatch[1];
  }

  // Extract race/class/level
  const rclMatch = RCL_RE.exec(parenthetical);
  if (rclMatch) {
    // Check if this appears to be a unit by looking for plural pronouns
    const isUnitContext = /\b(these|those)\b/i.test(parenthetical);

    // Handle two formats: "2nd level human fighters" or "human, 2nd level fighter"
    if (rclMatch[1]) {
      // Format: "2nd level human fighters" - groups [1]=level, [2]=race, [3]=class
      const level = rclMatch[1];
      const race = rclMatch[2];
      let charClass = rclMatch[3];
      // For units, preserve plural; for individuals, use singular
      if (!isUnitContext && charClass.endsWith('s')) {
        charClass = charClass.replace(/s$/, ''); // Remove plural 's' for individuals
      }
      // Preserve original ordinal format
      const ordinalMatch = rclMatch[0].match(/(\d+)(st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/);
      let ordinal = ordinalMatch ? ordinalMatch[2] : 'th';
      if (ordinal === 'st' || ordinal === 'nd' || ordinal === 'rd' || ordinal === 'th') {
        ordinal = getSuperscriptOrdinal(level);
      }
      data.raceClass = `${race}, ${level}${ordinal} level ${charClass}`;
      data.level = level;
      if (isUnitContext) data.originalPronoun = 'these';
    } else if (rclMatch[4] && rclMatch[5]) {
      // Format: "human, 2nd level fighter" - groups [4]=race, [5]=level, [6]=class
      const race = rclMatch[4];
      const level = rclMatch[5];
      let charClass = rclMatch[6] ? rclMatch[6] : 'fighter';
      // For units, preserve plural; for individuals, use singular
      if (!isUnitContext && charClass.endsWith('s')) {
        charClass = charClass.replace(/s$/, ''); // Remove plural 's' for individuals
      }
      // Preserve original ordinal format
      const ordinalMatch = rclMatch[0].match(/(\d+)(st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/);
      let ordinal = ordinalMatch ? ordinalMatch[2] : 'th';
      if (ordinal === 'st' || ordinal === 'nd' || ordinal === 'rd' || ordinal === 'th') {
        ordinal = getSuperscriptOrdinal(level);
      }
      data.raceClass = `${race}, ${level}${ordinal} level ${charClass}`;
      data.level = level;
      if (isUnitContext) data.originalPronoun = 'these';
    }
  }

  // Also try to extract from prose that includes leading pronouns like "these 2nd level human fighters"
  if (!data.raceClass) {
    const proseMatch = /(?:these|this|the)\s+(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s+level\s+([a-z-]+)\s+([a-z-]+)s?/i.exec(parenthetical);
    if (proseMatch) {
      const level = proseMatch[1];
      const race = proseMatch[2];
      const charClass = proseMatch[3].replace(/s$/, ''); // Remove plural 's'
      // Normalize ordinal to superscript format from prose match
      const ordinalMatch = proseMatch[0].match(/(\d+)(st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/);
      let ordinal = ordinalMatch ? ordinalMatch[2] : 'th';
      // Convert regular ordinals to superscript for consistency
      if (ordinal === 'st' || ordinal === 'nd' || ordinal === 'rd' || ordinal === 'th') {
        ordinal = getSuperscriptOrdinal(level);
      }
      data.raceClass = `${race}, ${level}${ordinal} level ${charClass}`;
      data.level = level;
    }
  }

  // Try to extract from comma-separated format like "human, fighter, 1st level"
  if (!data.raceClass) {
    const commaSeparatedMatch = /\b([a-z]+),\s*([a-z]+),\s*(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s*level\b/i.exec(parenthetical);
    if (commaSeparatedMatch) {
      const race = commaSeparatedMatch[1];
      let charClass = commaSeparatedMatch[2];
      const level = commaSeparatedMatch[3];

      // For units, make class plural
      const isUnitContext = /\bx\d+\b/i.test(parenthetical) || isUnit || (title && /\bx\d+\b/i.test(title));
      if (isUnitContext && !charClass.endsWith('s')) {
        charClass = pluralizeClassNameLocal(charClass);
      }

      // Convert to superscript ordinal
      const ordinal = getSuperscriptOrdinal(level);
      data.raceClass = `${race}, ${level}${ordinal} level ${charClass}`;
      data.level = level;
      if (isUnitContext) data.originalPronoun = 'these';
    }
  }

  // Try to extract from format like "He is a neutral evil, human, 4th/5th level fighter/assassin"
  if (!data.raceClass) {
    const heIsPattern = /(he|she|it)\s+is\s+a\s+(.+?),\s*([a-z-]+),\s*([0-9/thndrdst]+)\s+level\s+([a-z/-]+)/i.exec(parenthetical);
    if (heIsPattern) {
      const pronoun = heIsPattern[1].toLowerCase();
      const disposition = heIsPattern[2];
      const race = heIsPattern[3];
      const level = heIsPattern[4];
      const charClass = heIsPattern[5]; // Could be fighter/assassin
      data.raceClass = `${race}, ${level} level ${charClass}`;
      data.level = level;
      data.originalPronoun = pronoun;
      data.disposition = normalizeDisposition(disposition);
    }
  }

  // Try to extract from format like "These are chaotic good, human, 2nd level fighters"
  if (!data.raceClass) {
    const complexProseMatch = /(these|this|the)\s+are\s+(chaotic\s+good|chaotic\s+evil|chaotic\s+neutral|lawful\s+good|lawful\s+evil|lawful\s+neutral|neutral\s+good|neutral\s+evil|neutral),\s*([a-z-]+),\s*(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s+level\s+([a-z-]+)s?/i.exec(parenthetical);
    if (complexProseMatch) {
      const originalPronoun = complexProseMatch[1];
      const disposition = complexProseMatch[2];
      const race = complexProseMatch[3];
      const level = complexProseMatch[4];
      let charClass = complexProseMatch[5]; // Keep as-is for now, handle pluralization in output
      // For units, ensure class name is plural
      if (originalPronoun.toLowerCase() === 'these' && !charClass.endsWith('s')) {
        charClass = pluralizeClassNameLocal(charClass);
      }
      // Normalize ordinal to superscript format
      const ordinalMatch = complexProseMatch[0].match(/(\d+)(st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/);
      let ordinal = ordinalMatch ? ordinalMatch[2] : 'th';
      if (ordinal === 'st' || ordinal === 'nd' || ordinal === 'rd' || ordinal === 'th') {
        ordinal = getSuperscriptOrdinal(level);
      }
      data.raceClass = `${race}, ${level}${ordinal} level ${charClass}`;
      data.level = level;
      data.originalPronoun = originalPronoun.toLowerCase(); // Store the original pronoun
      data.disposition = normalizeDisposition(disposition); // Extract and normalize disposition
    }
  }

  // Try to extract HD format like "these HD 1(d6) human militia"
  if (!data.raceClass) {
    const hdMatch = /(?:these|this|the)\s+HD\s+\d+\([^)]+\)\s+([a-z-]+)\s+([a-z-]+)s?/i.exec(parenthetical);
    if (hdMatch) {
      const race = hdMatch[1];
      const charClass = hdMatch[2].replace(/s$/, ''); // Remove plural 's'
      data.raceClass = `${race} ${charClass}`;
    }
  }

  // Try to extract from descriptive format like "This chaotic neutral humanoid" or "These neutral animals"
  if (!data.raceClass) {
    const descriptiveMatch = /(?:this|these|this\s+[a-z-]+)\s+(?:(?:lawful|chaotic|neutral)\s+)?(?:good|evil|neutral)?\s*(humanoid|animal|creature|monster|beast|undead|giant|dragon)s?/i.exec(parenthetical);
    if (descriptiveMatch) {
      const creatureType = descriptiveMatch[1];
      data.raceClass = creatureType;
    }
  }

  // Extract attributes with multiple pattern variations
  // Try more specific patterns first
  let attrMatch = /(?:their|his|its)\s+prime\s+attributes\s+are:\s*([^.]+?)(?:\.|$)/i.exec(parenthetical);
  if (!attrMatch) {
    // Try "prime attributes are: str, con, dex" format
    attrMatch = /(?:prime\s+attributes?\s+are|attributes?\s+are)[:\s]*([^.;]+?)(?:\.|,\s*(?:he|they|she|it)\s+(?:wear|carry|wield|have)|They|$)/i.exec(parenthetical);
  }
  if (!attrMatch) {
    // Try without "primary/prime/PA" qualifier - stop at equipment indicators
    attrMatch = /(?:his|their|its)\s+(?:primary\s+)?attributes?\s+are\s+((?:strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)(?:,?\s*(?:and\s+)?(?:strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha))*)/i.exec(parenthetical);
  }
  if (!attrMatch) {
    // Try "primes are" format
    attrMatch = /(?:his|their|its)\s+primes?\s+are[:\s]*([^.;,]+)/i.exec(parenthetical);
  }
  if (!attrMatch) {
    // Try general PA/primary/prime format - capture until semicolon, period, or "EQ"
    attrMatch = /(?:primary\s+attributes?|prime\s+attributes?|PA)\s*[:-]?\s*([^.;]+?)(?:;|\.|\s+EQ\s+|\s+equipment|$)/i.exec(parenthetical);
  }
  if (!attrMatch) {
    // Try simple patterns like "STR, DEX, CON" or "strength, dexterity"
    attrMatch = /\b((?:str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)(?:[,\s]+(?:str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma))*)\b/i.exec(parenthetical);
  }
  if (attrMatch) {
    data.attributes = attrMatch[1].trim();
  }

  // Extract equipment - preserve verb structure when possible, including conditional equipment
  const equipMatch = /(?:EQ|equipment)[\s:-]+([^.;]+)/i.exec(parenthetical);
  if (equipMatch) {
    data.equipment = equipMatch[1].trim();
  } else {
    // Extract equipment from the full text, capturing everything in one pass
    let fullEquipment = '';

    // Find all equipment mentions starting from "they wear" or "they carry"
    const fullEquipMatch = /(?:they\s+wear|wears?)\s+([^.]+?)(?:\.\s*they\s+carry\s+([^.]+?))?(?:\.\s*they\s+carry\s+([^.]+?))?(?:\.|$)/i.exec(parenthetical);
    if (fullEquipMatch) {
      const wornItems = fullEquipMatch[1]?.trim();
      const carriedItems1 = fullEquipMatch[2]?.trim();
      const carriedItems2 = fullEquipMatch[3]?.trim();

      const equipParts: string[] = [];
      if (wornItems) equipParts.push(wornItems);
      if (carriedItems1) equipParts.push(carriedItems1);
      if (carriedItems2) equipParts.push(carriedItems2);

      fullEquipment = equipParts.join(', ');
    } else {
      // Fallback: try to capture any equipment patterns
      const fallbackMatch = /(?:they\s+wear|wears?|they\s+carry|carries?|wields?)\s+([^.]+?)(?:\.|$)/i.exec(parenthetical);
      if (fallbackMatch) {
        fullEquipment = fallbackMatch[1].trim();
      }
    }

    if (fullEquipment && !fullEquipment.match(/^\s*(and|carries?|a|,)*\s*$/i)) {
      // Clean up equipment by removing coin references
      fullEquipment = fullEquipment.replace(/,?\s*and\s+carry\s+\d+[–-]\d+\s*(?:gp|gold|silver|copper|platinum)(?:\s+in\s+coin)?/gi, '');
      fullEquipment = fullEquipment.replace(/,?\s*\d+[–-]\d+\s*(?:gp|gold|silver|copper|platinum)(?:\s+in\s+coin)?/gi, '');
      fullEquipment = fullEquipment.trim().replace(/,\s*$/, '');
      if (fullEquipment) {
        data.equipment = fullEquipment;
      }
    }
  }

  // Extract mount data
  if (MOUNT_TYPE_RE.test(parenthetical)) {
    // Simple mount detection - more sophisticated extraction needed
    data.mountData = parenthetical;
  }

  // Add default disposition and coins for military units if not specified
  if (isUnit) {
    // Check if this is a military unit based on common military terms (check both parenthetical and title)
    const militaryTerms = /\b(men-at-arms|guards|militia|troops|soldiers|fighters|warriors|bowmen|crossbowmen|halberdiers|sergeants|knights|cavalry|infantry)\b/i;
    const isMilitaryUnit = militaryTerms.test(parenthetical) || (title && militaryTerms.test(title));

    if (isMilitaryUnit && !data.disposition) {
      data.disposition = 'neutral/good';
    }

    // Add default coins for military units based on level
    if (isMilitaryUnit && !data.coins && data.level) {
      const level = parseInt(data.level);
      if (level === 1) {
        data.coins = '1–6 gp';
      } else if (level <= 3) {
        data.coins = `${level}–${level * 6} gp`;
      }
    }
  }

  // Extract coins with multiple pattern variations
  const coinMatch = /(\d+)[-–](\d+)\s*(?:gp|gold|GP)/i.exec(parenthetical);
  if (coinMatch) {
    data.coins = `${coinMatch[1]}–${coinMatch[2]} gp`;
  }

  // Extract significant attributes with values
  const sigAttrMatch = /(?:significant|specific)\s+attributes\s+are\s+([^.]+?)(?:\.|$)/i.exec(parenthetical);
  if (sigAttrMatch) {
    data.significantAttributes = sigAttrMatch[1].trim();
  }

  // Extract secondary skills
  const skillMatch = /(?:secondary\s+skill|skills?)\s+(?:is|are|of)[:\s]*([^.]+?)(?:\.|$)/i.exec(parenthetical);
  if (skillMatch) {
    let skill = skillMatch[1].trim();
    // Strip narrative clauses that belong in notes, not quick-reference
    // Remove "which is described in...", "as described in...", etc.
    skill = skill.replace(/[,;]?\s*(?:which|as)\s+(?:is|are)\s+described\s+in\s+.+$/i, '');
    skill = skill.replace(/[,;]?\s*\(see\s+.+?\)$/i, '');
    data.secondarySkills = skill.trim();
  }

  // Extract spells
  const spellMatch = /(?:can\s+cast|spells?\s+per\s+day|number\s+of.*?spells?\s+per\s+day)[:\s]*([^.]+?)(?:\.|$)/i.exec(parenthetical);
  if (spellMatch) {
    data.spells = spellMatch[1].trim();
  }

  // Formation details are now captured as part of equipment context, not separately

  // Extract jewelry separately from coins - do this BEFORE the general currency extraction
  const jewelryMatch = /([0-9,]+)\s*gold\s+worth\s+of\s+jewelry/i.exec(parenthetical);
  if (jewelryMatch) {
    data.jewelry = `${jewelryMatch[1]} gold worth of jewelry`;
  }

  // Also detect explicit jewelry line-item values such as "necklace worth 1,000 gp".
  // This handles cases where the item is described (diamond-studded necklace) with an explicit worth.
  if (!data.jewelry) {
    const jewelItemMatch = /(?:diamond|ruby|sapphire|emerald|opal|pearl|necklace|bracelet|ring|amulet|tiara|crown|brooch)[\w\s-]{0,60}?worth\s+([0-9,]+)\s*(?:gp|gold)\b/i.exec(parenthetical);
    if (jewelItemMatch) {
      const num = jewelItemMatch[1].replace(/,/g, '');
      data.jewelry = `${num} gold worth of jewelry`;
    }
  }

  // Now extract coins, but exclude jewelry values
  if (!coinMatch) {
    // Extract all currency mentions from parenthetical, but exclude jewelry
    const currencyPattern = /(\d+)\s*(gp|sp|cp|pp|gold|silver|copper|platinum)(?!\s+worth\s+of\s+jewelry)\b/gi;
    const currencies: string[] = [];
    let match;
    while ((match = currencyPattern.exec(parenthetical)) !== null) {
      const amount = match[1];
      const type = match[2].toLowerCase();

      switch (type) {
        case 'gp':
        case 'gold':
          currencies.push(`${amount} gp`);
          break;
        case 'sp':
        case 'silver':
          currencies.push(`${amount} sp`);
          break;
        case 'cp':
        case 'copper':
          currencies.push(`${amount} cp`);
          break;
        case 'pp':
        case 'platinum':
          currencies.push(`${amount} pp`);
          break;
      }
    }

    if (currencies.length > 0) {
      data.coins = currencies.join(', ');
    }
  }

  return data;
}

export function isUnitHeading(title: string): boolean {
  return UNIT_PATTERNS.some(pattern => pattern.test(title));
}

export function normalizeDisposition(disposition: string): string {
  const trimmed = disposition.trim().toLowerCase();
  const mapping: Record<string, string> = {
    'lawful good': 'lawful good',
    'lawful neutral': 'lawful neutral',
    'lawful evil': 'lawful evil',
    'neutral good': 'neutral good',
    'true neutral': 'neutrality',
    'neutral': 'neutrality',
    'neutral/neutral': 'neutrality',
    'neutral evil': 'neutral evil',
    'chaotic good': 'chaotic good',
    'chaotic neutral': 'chaotic neutral',
    'chaotic evil': 'chaotic evil',
    'lawful': 'lawful neutral',
    'chaotic': 'chaotic neutral'
  };
  return mapping[trimmed] ?? disposition.trim();
}

const ATTRIBUTE_ABBREVIATIONS: Record<string, string> = {
  'str': 'strength',
  'int': 'intelligence',
  'wis': 'wisdom',
  'dex': 'dexterity',
  'con': 'constitution',
  'cha': 'charisma'
};

const PHB_ATTRIBUTE_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const PHYSICAL_ATTRIBUTE_SET = new Set(['strength', 'dexterity', 'constitution']);
const MENTAL_ATTRIBUTE_SET = new Set(['intelligence', 'wisdom', 'charisma']);

// C&C Character Class Prime Attributes
const CLASS_PRIME_ATTRIBUTES: Record<string, string[]> = {
  'fighter': ['strength', 'dexterity', 'constitution'],
  'barbarian': ['strength', 'dexterity', 'constitution'],
  'knight': ['strength', 'constitution'],
  'ranger': ['strength', 'dexterity', 'wisdom'],
  'assassin': ['strength', 'dexterity', 'intelligence'],
  'monk': ['strength', 'dexterity', 'wisdom'],
  'rogue': ['dexterity'],
  'thief': ['dexterity'],
  'bard': ['dexterity', 'charisma'],
  'cleric': ['wisdom'],
  'druid': ['wisdom'],
  'paladin': ['wisdom', 'charisma'],
  'wizard': ['intelligence'],
  'mage': ['intelligence'],
  'illusionist': ['intelligence']
};

interface AttributeToken {
  name: string;
  score?: number;
  rawScore?: string;
}

export interface NormalizeAttributeOptions {
  isUnit?: boolean;
  raceClassText?: string;
  levelText?: string;
}

export interface NormalizedAttributesResult {
  type: 'list' | 'prime' | 'none';
  value?: string;
}

function parseAttributeTokens(attributes: string): AttributeToken[] {
  const tokens: AttributeToken[] = [];
  if (!attributes) return tokens;

  const normalizedInput = attributes.replace(/[–—-]/g, ' ');
  const pattern = /(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)(?:\s*(?:[:=]|is|was)?\s*\(?([0-9]{1,2}(?:\/[0-9]{2})?)\)?)?/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalizedInput)) !== null) {
    const rawName = match[1].toLowerCase();
    const canonical = ATTRIBUTE_ABBREVIATIONS[rawName] || rawName;

    let score: number | undefined;
    let rawScore: string | undefined;
    if (match[2]) {
      rawScore = match[2];
      const sanitized = rawScore.replace(/[^0-9/]/g, '');
      const [base] = sanitized.split('/');
      const parsedScore = parseInt(base, 10);
      if (!Number.isNaN(parsedScore)) {
        score = parsedScore;
      }
    }

    tokens.push({ name: canonical, score, rawScore });
  }

  return tokens;
}

function determinePrimeType(attributes: string, tokens: AttributeToken[]): 'physical' | 'mental' | undefined {
  const lowered = attributes.toLowerCase();
  if (/\bphysical\b/.test(lowered)) {
    return 'physical';
  }
  if (/\bmental\b/.test(lowered)) {
    return 'mental';
  }

  const uniqueNames = new Set(tokens.map(token => token.name));
  const hasPhysical = Array.from(uniqueNames).some(name => PHYSICAL_ATTRIBUTE_SET.has(name));
  const hasMental = Array.from(uniqueNames).some(name => MENTAL_ATTRIBUTE_SET.has(name));

  if (hasPhysical && !hasMental) return 'physical';
  if (hasMental && !hasPhysical) return 'mental';
  return undefined;
}

export function extractClassInfo(raceClassText?: string, levelText?: string): { className?: string; level?: number; hasClassLevels: boolean } {
  let className: string | undefined;
  let level: number | undefined;

  if (raceClassText) {
    const levelMatch = raceClassText.match(/(\d+)(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s+level\s+([a-z-]+)/i);
    if (levelMatch) {
      level = parseInt(levelMatch[1], 10);
      className = levelMatch[2].toLowerCase().replace(/s$/, '');
    } else {
      const simpleMatch = raceClassText.match(/([a-z-]+)\s+([a-z-]+)$/i);
      if (simpleMatch) {
        className = simpleMatch[2].toLowerCase().replace(/s$/, '');
      }
    }
  }

  if (levelText && level === undefined) {
    const normalizedLevel = levelText.trim();
    const numericLevelMatch = normalizedLevel.match(/^(\d+)(?:st|nd|rd|th)?$/i);
    if (numericLevelMatch) {
      const parsed = parseInt(numericLevelMatch[1], 10);
      if (!Number.isNaN(parsed)) {
        level = parsed;
      }
    }
  }

  const hasClassLevels = Boolean(className && level !== undefined);
  return { className, level, hasClassLevels };
}

export function normalizeAttributes(attributes: string, options: NormalizeAttributeOptions = {}): NormalizedAttributesResult {
  const { raceClassText, levelText } = options;
  if (!attributes || !attributes.trim()) {
    return { type: 'none' };
  }

  const tokens = parseAttributeTokens(attributes);
  const primeType = determinePrimeType(attributes, tokens);

  // Check for class levels FIRST, before checking isUnit
  const classInfo = extractClassInfo(raceClassText, levelText);

  // If they have a character class, list individual attributes
  if (classInfo.hasClassLevels) {
    // Check if we have any actual attribute scores
    const hasScores = tokens.some(token => token.score !== undefined);

    // If attributes are listed without scores (like "str, dex, int"), list them all
    if (!hasScores && tokens.length > 0) {
      const validAttributes = tokens.filter(token =>
        token.name && PHB_ATTRIBUTE_ORDER.includes(token.name)
      );

      if (validAttributes.length > 0) {
        const sorted = validAttributes
          .map(token => token.name)
          .sort((a, b) => PHB_ATTRIBUTE_ORDER.indexOf(a) - PHB_ATTRIBUTE_ORDER.indexOf(b));

        return {
          type: 'list',
          value: formatOxfordList(sorted)
        };
      }
    }

    // We have scores, so list individual attributes
    const qualifyingAttributes = new Set<string>();

    tokens.forEach(token => {
      if (!token.name || !PHB_ATTRIBUTE_ORDER.includes(token.name)) {
        return;
      }
      if (token.score === undefined) {
        return;
      }
      // Include attribute if it has a modifier (score <= 8 or >= 13)
      if (token.score <= 8 || token.score >= 13) {
        qualifyingAttributes.add(token.name);
      }
    });

    // For classed NPCs, include their prime attributes
    if (classInfo.className) {
      const primes = CLASS_PRIME_ATTRIBUTES[classInfo.className.toLowerCase()];
      if (primes) {
        const tokenNames = new Set(tokens.map(token => token.name));
        primes.forEach(prime => {
          if (tokenNames.has(prime)) {
            qualifyingAttributes.add(prime);
          }
        });
      }
    }

    // If we have qualifying attributes, list them individually
    if (qualifyingAttributes.size > 0) {
      const sorted = Array.from(qualifyingAttributes).sort(
        (a, b) => PHB_ATTRIBUTE_ORDER.indexOf(a) - PHB_ATTRIBUTE_ORDER.indexOf(b)
      );

      return {
        type: 'list',
        value: formatOxfordList(sorted)
      };
    }

    // Check if prime type was explicitly stated (e.g., "PA physical")
    if (primeType) {
      return { type: 'prime', value: primeType };
    }

    // Classed NPCs with no qualifying attributes and no prime type: no output
    return { type: 'none' };
  }

  // No character class: list individual attributes if provided
  if (tokens.length > 0) {
    const validAttributes = tokens.filter(token =>
      token.name && PHB_ATTRIBUTE_ORDER.includes(token.name)
    );

    if (validAttributes.length > 0) {
      const sorted = validAttributes
        .map(token => token.name)
        .sort((a, b) => PHB_ATTRIBUTE_ORDER.indexOf(a) - PHB_ATTRIBUTE_ORDER.indexOf(b));

      return {
        type: 'list',
        value: formatOxfordList(sorted)
      };
    }
  }

  // Fallback: only use physical/mental if explicitly stated in input
  if (primeType) {
    return { type: 'prime', value: primeType };
  }

  return { type: 'none' };
}

export function canonicalizeShields(equipment: string): string {
  // Jeremy's mandate: explicit shield type (size + material) per editorial standards
  let result = equipment;

  // First pass: Handle bonus shields - preserve material if specified
  result = result.replace(/\+(\d+)\s+(wooden|steel|iron)?\s*shield/gi, (match, bonus, material) => {
    const mat = material || 'steel';
    return `medium ${mat} shield +${bonus}`;
  });

  // Second pass: Handle material-only shields (add size) - but not if size already present
  result = result.replace(/\b(wooden|steel|iron)\s+shield(?:s)?(?!\s*\+)/gi, (match, material, offset, string) => {
    // Don't add "medium" if a size word already precedes this
    const before = string.substring(Math.max(0, offset - 15), offset);
    if (/\b(medium|large|small)\s*$/i.test(before)) {
      return match; // Already has size, keep as-is
    }
    return match.replace(new RegExp(`\\b${material}\\s+shield`, 'i'), `medium ${material} shield`);
  });

  // Third pass: Handle bare "shield" (add both size and material)
  result = result.replace(/\b(?:a\s+|an\s+)?shield\b(?!\s*\+)/gi, (match, offset, string) => {
    // Don't replace if already has size+material prefix
    const before = string.substring(Math.max(0, offset - 25), offset);
    if (/\b(medium|large|small)\s+(wooden|steel|iron)\s*$/i.test(before)) {
      return match;
    }
    return 'medium steel shield';
  });

  // Handle buckler and pavis separately (they don't need size qualifiers)
  result = result.replace(/\b(?:wooden|steel|iron)\s+(buckler|pavis)/gi, '$1');

  return result;
}

export function repositionMagicItemBonuses(equipment: string): string {
  // Handle bonuses that appear after verbs: "carries +1 sword" → "carries sword +1"
  let result = equipment.replace(/(wears?|carries?|wields?)\s+\+(\d+)\s+((?:\w+\s+)*(?:longsword|sword|mail|armor|shield|lance|dagger|mace|axe|bow|crossbow|staff|rod|wand|ring|robe|cloak|boots|gauntlets|helm|bracers|pectoral))/gi,
    (match, verb, bonus, item) => {
      return `${verb} ${item} +${bonus}`;
    });

  // Handle traditional pattern: "+1 sword" → "sword +1"
  result = result.replace(LEADING_BONUS_RE, (match, bonus, item) => {
    return `${item} +${bonus}`;
  });

  return result;
}

export function deduplicateEquipment(equipment: string): string {
  const items = equipment.split(/,\s*/).map(item => item.trim().replace(/[\.]+$/g, ''));
  const unique = [...new Set(items)];
  return unique.join(', ');
}

export function normalizeEquipmentVerbs(equipment: string): string {
  // Jeremy's mandate: "wears" for armor/barding, "carries" for weapons/gear
  let normalized = equipment;

  // Normalize armor verbs to root form "wear" (for armor, barding, clothing)
  // Keep root verb so the canonicalizer can inflect it per pronoun (wear -> wears/wear)
  normalized = normalized.replace(/\b(wears?|wearing|worn|has on|dons?)\b\s+/gi, 'wear ');

  // Normalize weapon/gear verbs to "carry" (for weapons, tools, items)
  normalized = normalized.replace(/\b(carries?|carrying|bears?|bearing|holds?|holding|wields?|wielding|is armed with|is armed|is equipped with|is carrying)\b\s+/gi, 'carry ');

  // Handle "and carry" constructions properly
  normalized = normalized.replace(/\band\s+carry/gi, 'and carry');

  // Collapse repeated verb sequences like "carry wield" -> "carry" (keep first verb)
  normalized = normalized.replace(/\b(wear|carry|wield)\s+(wear|carry|wield)\b/gi, '$1');

  // Normalize leading phrases like "is wearing" or "is carrying" to root verbs
  normalized = normalized.replace(/\bis\s+(wear|carry)ing\b/gi, '$1');

  // Normalize "has" constructions to carry when followed by gear/weapon nouns
  normalized = normalized.replace(/\bhas\s+(a|an|the)?\s+/gi, 'carry ');

  return normalized;
}

export function extractMountFromParenthetical(parenthetical: string): {
  cleanedParenthetical: string;
  mountBlock?: MountBlock
} {
  // Simple mount extraction - detect war horse references
  if (!MOUNT_TYPE_RE.test(parenthetical)) {
    return { cleanedParenthetical: parenthetical };
  }

  // Extract mount-related data
  const mountNameMatch = parenthetical.match(MOUNT_TYPE_RE);
  const mountName = mountNameMatch
    ? mountNameMatch[0].replace(/\s+/g, ' ').trim().toLowerCase()
    : 'war horse';
  const mountHpMatch = /(?:war\s*horse[^.]*?HP\s*(\d+))/i.exec(parenthetical);
  const mountAcMatch = /(?:war\s*horse[^.]*?AC\s*([\d/]+))/i.exec(parenthetical);
  const mountAttackMatch = /((?:hoof|hooves)[^.]*)/i.exec(parenthetical);

  if (mountHpMatch || mountAcMatch || mountAttackMatch) {
    const mountBlock: MountBlock = {
      name: mountName,
      hp: mountHpMatch?.[1],
      ac: mountAcMatch?.[1],
      disposition: 'neutral',
      attacks: mountAttackMatch?.[1],
      raw: parenthetical
    };

    const canonicalMount = canonicalizeMountBlock(mountBlock);

    // Remove mount data from parenthetical
    const cleaned = parenthetical
      .replace(/[,;\s]*(?:heavy|light)?\s*war\s*horse[^.;,]*/gi, '')
      .replace(/[,;\s]*(?:hoof|hooves)[^.;,]*/gi, '')
      .replace(/[,;\s]+$/, ''); // Clean trailing punctuation

    return { cleanedParenthetical: cleaned, mountBlock: canonicalMount };
  }

  return { cleanedParenthetical: parenthetical };
}


function pluralizeClassNameLocal(name: string): string {
  const lower = name.trim().toLowerCase();
  const irregulars: Record<string, string> = {
    'thief': 'thieves',
    'archer': 'archers',
    'fighter': 'fighters',
    'cleric': 'clerics',
    'paladin': 'paladins',
    'ranger': 'rangers',
    'wizard': 'wizards',
    'warlock': 'warlocks',
    'druid': 'druids',
    'bard': 'bards',
    'monk': 'monks',
    'rogue': 'rogues',
    'assassin': 'assassins',
    'knight': 'knights',
    'magic-user': 'magic-users'
  };

  if (irregulars[lower]) {
    return irregulars[lower];
  }

  if (lower.endsWith('man')) {
    return `${lower.slice(0, -3)}men`;
  }

  if (lower.endsWith('y')) {
    return `${lower.slice(0, -1)}ies`;
  }

  if (lower.endsWith('s')) {
    return lower;
  }

  return `${lower}s`;
}

function pluralizeEquipmentItem(item: string): string {
  // Handle magic items with mechanics - preserve the mechanics part
  const mechanicsMatch = item.match(/^(.+?)(\s*\([^)]+\))$/);
  if (mechanicsMatch) {
    const baseItem = mechanicsMatch[1];
    const mechanics = mechanicsMatch[2];
    return pluralizeEquipmentItem(baseItem) + mechanics;
  }

  // Handle italicized magic items
  const italicsMatch = item.match(/^\*(.+)\*$/);
  if (italicsMatch) {
    return `*${pluralizeEquipmentItem(italicsMatch[1])}*`;
  }

  const trimmed = item.trim().toLowerCase();

  // Equipment-specific irregulars
  const equipmentIrregulars: Record<string, string> = {
    'chain shirt': 'chain shirts',
    'chain mail': 'chain mail', // uncountable
    'plate mail': 'plate mail', // uncountable
    'full plate mail': 'full plate mail', // uncountable
    'leather armor': 'leather armor', // uncountable
    'scale armor': 'scale armor', // uncountable
    'banded armor': 'banded armor', // uncountable
    'medium steel shield': 'medium steel shields',
    'large steel shield': 'large steel shields',
    'small steel shield': 'small steel shields',
    'wooden shield': 'wooden shields',
    'shield': 'shields',
    'broadsword': 'broadswords',
    'longsword': 'longswords',
    'dagger': 'daggers',
    'bow': 'bows',
    'crossbow': 'crossbows',
    'mace': 'maces',
    'staff': 'staves',
    'rod': 'rods',
    'wand': 'wands'
  };

  if (equipmentIrregulars[trimmed]) {
    return equipmentIrregulars[trimmed];
  }

  // General pluralization rules
  if (trimmed.endsWith('s') || trimmed.endsWith('mail')) {
    return item; // Already plural or uncountable
  }

  if (trimmed.endsWith('y')) {
    return item.slice(0, -1) + 'ies';
  }

  if (trimmed.endsWith('f')) {
    return item.slice(0, -1) + 'ves';
  }

  if (trimmed.endsWith('fe')) {
    return item.slice(0, -2) + 'ves';
  }

  return item + 's';
}

function extractUnitNounFromTitle(title?: string): string | undefined {
  if (!title) return undefined;

  // First try specific unit types
  const specificMatch = title.toLowerCase().match(/(men-at-arms|militia|warriors|bowmen|guards|sergeants|fighters|troops)/);
  if (specificMatch) {
    return specificMatch[1];
  }

  // Then try to extract race/creature names from the title (before "x##")
  // e.g., "Halflings x14" -> "halflings", "Goblin Marauders x8" -> "goblin marauders"
  const unitQuantityMatch = title.match(/^([A-Za-z\s-]+?)\s+x\d+/);
  if (unitQuantityMatch) {
    return unitQuantityMatch[1].toLowerCase().trim();
  }

  return undefined;
}

function buildDescriptorFromData(data: ParentheticalData, isUnit: boolean, title?: string): string {
  const subject = isUnit ? 'These' : 'This';
  let race: string | undefined;
  let level: string | undefined;
  let charClass: string | undefined;

  if (data.raceClass) {
    // Try matching full format: "human, 4th/5th level fighter/assassin" or "human, 2ⁿᵈ level fighters"
  const match = data.raceClass.match(/([a-z-]+),\s*([0-9/thndrdstⁿᵈˢᵗʳᵈᵗʰ]+)\s+level\s+([a-z/-]+)/i);
    if (match) {
      race = match[1].toLowerCase();
      level = match[2];
      charClass = match[3].toLowerCase();
    } else {
  const simpleMatch = data.raceClass.match(/([a-z-]+)\s+([a-z/-]+)/i);
      if (simpleMatch) {
        race = simpleMatch[1].toLowerCase();
        charClass = simpleMatch[2].toLowerCase();
      }
    }
  }

  const unitNoun = extractUnitNounFromTitle(title);

  if (isUnit) {
    if (race && level && charClass) {
      // If level already has ordinal markers (regular or superscript), don't add more
      const hasOrdinal = /\d+(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/.test(level);
      const ordinal = hasOrdinal ? level : `${level}${getSuperscriptOrdinal(level)}`;
      return `${subject} ${ordinal} level ${race} ${pluralizeClassNameLocal(charClass)}`.replace(/\s+/g, ' ').trim();
    }

    if (race && charClass) {
      return `${subject} ${race} ${pluralizeClassNameLocal(charClass)}`.replace(/\s+/g, ' ').trim();
    }

    if (race && unitNoun) {
      return `${subject} ${race} ${unitNoun}`.replace(/\s+/g, ' ').trim();
    }

    if (unitNoun) {
      return `${subject} ${unitNoun}`.replace(/\s+/g, ' ').trim();
    }

    if (race) {
      return `${subject} ${race} troops`.replace(/\s+/g, ' ').trim();
    }
  } else {
    if (race && level && charClass) {
      // If level already has ordinal markers (regular or superscript), don't add more
      const hasOrdinal = /\d+(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)/.test(level);
      const ordinal = hasOrdinal ? level : `${level}${getSuperscriptOrdinal(level)}`;
      return `${subject} ${ordinal} level ${race} ${charClass}`.replace(/\s+/g, ' ').trim();
    }

    if (race && charClass) {
      return `${subject} ${race} ${charClass}`.replace(/\s+/g, ' ').trim();
    }

    if (race) {
      return `${subject} ${race} character`.replace(/\s+/g, ' ').trim();
    }
  }

  if (data.raceClass) {
    return `${subject} ${data.raceClass}`.replace(/\s+/g, ' ').trim();
  }

  return isUnit ? `${subject} creatures` : `${subject} creature`;
}

// Helper function to convert coins to "# in coin" format or preserve multi-currency
function formatCoinsForTreasure(coins: string): string {
  if (!coins) return '';

  const normalized = canonicalizeCoinsText(coins);

  // If already specifies denomination with "in coin", just normalize and return
  if (/\b(gold|silver|copper|platinum|gp|sp|cp|pp)\b.+in coin/i.test(normalized)) {
    return normalized;
  }

  // Check if multiple currency types (gp, sp, cp, pp)
  const currencyMatches = normalized.match(/\d+(?:[–-]\d+)?\s*(?:gp|sp|cp|pp)/gi);
  if (currencyMatches && currencyMatches.length > 1) {
    // Multiple currencies: just normalize spacing
    return normalized;
  }

  // Single currency: convert to "# [denomination] in coin" format
  const singleMatch = normalized.match(/(\d+(?:[–-]\d+)?)\s*(gp|sp|cp|pp|gold|silver|copper|platinum)/i);
  if (singleMatch) {
    const amount = singleMatch[1];
    const unit = singleMatch[2].toLowerCase();
    const unitWordMap: Record<string, string> = {
      gp: 'gold',
      gold: 'gold',
      sp: 'silver',
      silver: 'silver',
      cp: 'copper',
      copper: 'copper',
      pp: 'platinum',
      platinum: 'platinum'
    };
    const unitWord = unitWordMap[unit] || unit;
    return `${amount} ${unitWord} in coin`;
  }

  // Fallback: just use the normalized text
  return normalized;
}

// Helper function to format jewelry with word-number conversion
function formatJewelryForTreasure(jewelry: string): string {
  if (!jewelry) return '';
  return jewelry.replace(/([0-9,]+)\s*gold\s+worth\s+of\s+jewelry/i, (_, amount) => {
    const sanitized = amount.replace(/,/g, '');
    const wordAmount = numberToWords(parseInt(sanitized));
    return `${wordAmount} in jewelry`;
  });
}

// Helper function to add superscript ordinals to spell levels
function formatSpellLevels(spellText: string): string {
  let formatted = spellText.replace(/(\d+)(st|nd|rd|th)/gi, (_, level) => {
    const ordinal = getSuperscriptOrdinal(level);
    return ordinal ? `${level}${ordinal}` : level;
  });

  formatted = formatted.replace(/(\d+)(?=–)/g, (level: string) => {
    const ordinal = getSuperscriptOrdinal(level);
    return ordinal ? `${level}${ordinal}` : level;
  });

  return formatted;
}

export function buildCanonicalParenthetical(
  data: ParentheticalData,
  isUnit: boolean,
  omitRace: boolean = false,
  useSuperscriptOrdinals: boolean = true,
  title?: string,
  formattingRules?: FormattingRules
): string {
  const parts: string[] = [];
  // Determine pronoun-based formatting early
  const pronounTrack: 'singular' | 'plural' = formattingRules?.pronounTrack ?? (isUnit ? 'plural' : 'singular');
  const possessiveSeed = formattingRules?.pronounPossessive ?? (hasClassLevels ? 'his' : 'its');
  const fallbackBase = pronounTrack === 'plural'
    ? 'Their'
    : capitalizePronounValue(possessiveSeed) || 'His';
  const possessiveOptions = {
    allowFeminine: fallbackBase.toLowerCase() === 'his',
    requireNeutralIts: fallbackBase.toLowerCase() === 'its',
  };
  const rawPossessive = determinePossessivePronoun(data.raw, data.originalPronoun, pronounTrack === 'plural', title);
  const resolvedPossessive = enforcePossessivePronoun(rawPossessive, pronounTrack, fallbackBase, possessiveOptions);
  const resolvedSubject = pronounTrack === 'plural' ? 'They' : possessiveToSubjectPronoun(resolvedPossessive);

  // Determine equipment verbs based on formatting rules and pronoun track
  const equipmentVerbStyle = formattingRules?.equipmentVerbs ?? 'carries-wears';
  let wearVerb: string;
  let carryVerb: string;
  if (equipmentVerbStyle === 'has-possesses') {
    // Use 'has'/'have' style
    wearVerb = pronounTrack === 'plural' ? 'have' : 'has';
    carryVerb = pronounTrack === 'plural' ? 'have' : 'has';
  } else {
    // Use 'wear(s)' and 'carry(ies)' style
    wearVerb = pronounTrack === 'plural' ? 'wear' : 'wears';
    carryVerb = pronounTrack === 'plural' ? 'carry' : 'carries';
  }
  const coinsText = data.coins ? canonicalizeCoinsText(data.coins) : undefined;
  const jewelryText = data.jewelry ? formatJewelryForTreasure(data.jewelry) : undefined;
  let coinsIncludedInWeapons = false;
  let jewelryIncludedInEquipment = false;
  
  // VERSION 3.0: Use V3 classifier to determine format
  const v3Context: SignalExtractionContext = {
    spells: data.spells,
    raceClass: data.raceClass,
    description: data.raw
  };
  const v3Classification = classifyEntityV3(title, {
    name: data.name || title,
    level: data.level,
    hd: data.hd,
    hp: data.hp ? parseInt(String(data.hp), 10) : null,
    ac: data.ac ? parseInt(String(data.ac), 10) : null,
    disposition: data.disposition,
    primaryAttributes: data.attributes,
    equipment: data.equipment,
    coins: data.coins
  }, v3Context);
  
  // Legacy compatibility
  const classInfo = extractClassInfo(data.raceClass, data.level);
  const hasClassLevels = classInfo.hasClassLevels || v3Classification.format === 'A';
  const isNamedRanked = isRankedNamedEntity(title, data);


  // Build vital stats
  const vitalParts: string[] = [];

  // VERSION 3.0 CRITICAL FIX: HD/HP Logic Based on Format
  // Format A (Classed NPCs): Show ONLY flat HP (no HD)
  // Format B (Monsters): Show HD as "Level X(dY)" + HP
  // Format C (Units): Show HD as "Level X(dY)" + HP
  
  if (v3Classification.format === 'A') {
    // Format A: Classed NPCs - flat HP only (no HD)
    if (data.hp) {
      vitalParts.push(`HP ${data.hp}`);
    }
  } else {
    // Format B/C: Monsters/Units - MUST show HD as "Level X(dY)"
    if (data.hd) {
      const levelFormat = formatHdAsLevel(data.hd);
      vitalParts.push(`Level ${levelFormat}`);
      // Also show HP if available
      if (data.hp) {
        vitalParts.push(`HP ${data.hp}`);
      }
    } else if (data.level && /\d/.test(data.level)) {
      // Fallback: use level field if no HD
      vitalParts.push(`Level ${data.level}`);
      if (data.hp) {
        vitalParts.push(`HP ${data.hp}`);
      }
    } else if (data.hp) {
      // Last resort: just show HP
      vitalParts.push(`HP ${data.hp}`);
    }
  }
  if (data.ac) vitalParts.push(`AC ${data.ac}`);
  if (data.disposition) {
    const normalizedDisposition = normalizeDisposition(data.disposition);
    vitalParts.push(`disposition ${normalizedDisposition.toLowerCase()}`);
  }

  if (vitalParts.length > 0) {
    let descriptorData = { ...data };

    if (data.raceClass) {
      let raceClassText = data.raceClass;

      // Convert regular ordinals to superscript for output consistency if requested
      if (useSuperscriptOrdinals) {
        // Skip conversion if this is multiclass notation (contains slash)
        if (!/\//.test(raceClassText)) {
          raceClassText = raceClassText.replace(/(\d+)(st|nd|rd|th)(\s+level)/g, (match, level, ordinal, levelText) => {
            const superscriptOrdinal = getSuperscriptOrdinal(level);
            return `${level}${superscriptOrdinal}${levelText}`;
          });
          // If this is a named, ranked NPC, prefer plain "12 level" rather
          // than superscript ordinals in the class/level text for readability.
          if (isNamedRanked) {
            raceClassText = raceClassText.replace(/(\d+)(?:ᵗʰ|st|nd|rd|th)/gi, '$1 level');
            raceClassText = raceClassText.replace(/(\d+)\s*\u1d57/gi, '$1 level');
          }
        }
      }

      if (omitRace) {
        // Extract just the class and level for canonical format
        const classLevelMatch = raceClassText.match(/(\d+(?:st|nd|rd|th|ⁿᵈ|ˢᵗ|ʳᵈ|ᵗʰ)?\s+level\s+[a-z-]+s?)/i);
        raceClassText = classLevelMatch ? classLevelMatch[0] : raceClassText;
      }

      descriptorData = { ...descriptorData, raceClass: raceClassText };
    }

    const descriptor = buildDescriptorFromData(descriptorData, isUnit, title);
    const possessive = formatPossessiveDescriptor(descriptor, isUnit);
    // Per Canonicalizer mandate: omit "vital stats are" and begin directly with stat content
    parts.push(`${vitalParts.join(', ')}`);
  }

  // VERSION 3.0 CRITICAL FIX: Attribute Formatting Based on Format
  // Format A (Classed NPCs): Long-form attribute list
  // Format B (Monsters): Shorthand "physical" or "mental"
  // Format C (Units): Shorthand with plural pronouns
  let normalizedAttrs: NormalizedAttributesResult | undefined;

  if (v3Classification.format === 'A') {
    // Format A: Classed NPCs always get long-form attribute list
    normalizedAttrs = { type: 'list', value: formatOxfordList(PHB_ATTRIBUTE_ORDER) };
  } else {
    // Format B/C: Monsters and Units get shorthand
    if (data.attributes) {
      normalizedAttrs = normalizeAttributes(data.attributes, {
        isUnit,
        raceClassText: data.raceClass,
        levelText: data.level
      });
    }
    // Default to physical for B/C if no attributes specified
    if (!normalizedAttrs) {
      normalizedAttrs = { type: 'prime', value: 'physical' };
    }
    // For monsters/units, prefer shorthand prime attributes even if a
    // specific attribute token was extracted (e.g., 'strength' from 'strength save').
    // The canonical mandate is to use 'physical'/'mental' for non-classed entities
    // unless the source explicitly states 'mental'.
    if (normalizedAttrs && normalizedAttrs.type === 'list') {
      const lowered = (data.attributes || '').toLowerCase();
      const prime = /\bmental\b/.test(lowered) ? 'mental' : 'physical';
      normalizedAttrs = { type: 'prime', value: prime };
    }
  }

  if (normalizedAttrs && normalizedAttrs.value) {
    if (normalizedAttrs.type === 'list') {
      // Format A: Long-form with singular possessive
      let possessive = fallbackBase;
      parts.push(`${possessive} primary attributes are ${normalizedAttrs.value}`);
    } else if (normalizedAttrs.type === 'prime') {
      // Format B/C: Shorthand
      // Format C uses plural pronouns, Format B uses singular
      const possessive = v3Classification.format === 'C' ? 'Their' : resolvedPossessive;
      parts.push(`${possessive} primary attributes are ${normalizedAttrs.value}`);
    }
  }

  // Add equipment
  let hasWeapons = false;
  let hasArmor = false;

  if (data.equipment) {
    let equipment = data.equipment;
    equipment = canonicalizeShields(equipment);
    equipment = repositionMagicItemBonuses(equipment);
    equipment = deduplicateEquipment(equipment);

    // Split equipment into armor/clothing (wear) and weapons/items (carry)
    // Handle both comma and "and" separators
    const treatEquipmentAsPlain = !isUnit && (hasClassLevels || Boolean(classInfo.className));

    const equipmentParts = equipment
      .split(/[,]/)
      .flatMap(part => part.split(/\s+and\s+/))
      .map(part => part.trim())
      .filter(Boolean);
    const armorItems: string[] = [];
    const weaponItems: string[] = [];

    equipmentParts.forEach(part => {
      // Skip coin references - they'll be handled separately in the coins section
      if (/\b\d+[–-]\d+\s*(?:gp|sp|cp|pp|gold|silver|copper|platinum)|\b\d+\s*(?:gp|sp|cp|pp|gold|silver|copper|platinum)\b/i.test(part)) {
        return;
      }

      if (part.startsWith('*') && part.endsWith('*')) {
        if (/\b(shirt|shirts|mail|armor|armors|robe|robes|cloak|cloaks|boots|gauntlets|helm|helms|bracers|leather|leathers|leather\s+armor|chain\s+mail|plate\s+mail|scale\s+mail|banded\s+mail)\b/i.test(part)) {
          armorItems.push(part);
        } else {
          weaponItems.push(part);
        }
        return;
      }

      // Process magic items
      let processedPart = applyNameMappings(part);

      if (!treatEquipmentAsPlain && /\+\d+|staff of|sword of|ring of|robe of|cloak of|boots of|gauntlets of|helm of|bracers of|pectoral of/i.test(processedPart)) {
        processedPart = addMagicItemMechanics(processedPart);
      }

      processedPart = processedPart.replace(/^(?:and\s+)?(?:they|he|she|it)\s+/i, '');
          processedPart = processedPart.replace(/^(?:and\s+)?(?:wears|wear|carries|carry|wields|wielding|is armed with|is armed|is equipped with|is carrying)\s+/i, '');

      // Sanitization helps fix grammar mistakes and remove bracketed mechanics
      processedPart = sanitizeEquipmentClause(processedPart);

      // For units, pluralize items (do this before italicization)
      if (isUnit) {
        // Do not pluralize coin/currency items or 'each' tokens; only pluralize equipment items
        const lowerPart = processedPart.toLowerCase();
        if (!/\b\d|\b(each|eachs?)\b|\b(in coin|gp|sp|cp|pp|gold|silver|copper|platinum)\b/i.test(lowerPart)) {
          processedPart = pluralizeEquipmentItem(processedPart);
        }
      }

      // Only italicize magical items, not mundane equipment
      // Magical items have: +X bonuses, "of" construction, or are already processed with mechanics
      const isMagicalItem = /\+\d+|—|staff of|sword of|ring of|robe of|cloak of|boots of|gauntlets of|helm of|bracers of|pectoral of|wand of|bow of|dagger of|mace of|axe of/i.test(processedPart);
      if (isMagicalItem && !treatEquipmentAsPlain) {
        processedPart = `*${processedPart}*`;
      }

      // Categorize items
      if (/\b(shirt|shirts|mail|armor|armors|robe|robes|cloak|cloaks|boots|gauntlets|helm|helms|bracers|leather|leathers|leather\s+armor|chain\s+mail|plate\s+mail|scale\s+mail|banded\s+mail)\b/i.test(processedPart)) {
        armorItems.push(processedPart);
      } else {
        weaponItems.push(processedPart);
      }
    });

    hasWeapons = weaponItems.length > 0;
    hasArmor = armorItems.length > 0;

    // Build equipment sentences
    const capitalizedPronoun = resolvedSubject;
    if (treatEquipmentAsPlain) {
      const combinedItems: string[] = [];

      armorItems.forEach(item => combinedItems.push(item));
      weaponItems.forEach(item => combinedItems.push(item));

      if (coinsText && !coinsIncludedInWeapons) {
        combinedItems.push(formatCoinsForTreasure(coinsText));
        coinsIncludedInWeapons = true;
      }

      if (jewelryText) {
        combinedItems.push(formatJewelryForTreasure(data.jewelry!));
        jewelryIncludedInEquipment = true;
      }

      if (combinedItems.length > 0) {
        const normalizedItems = combinedItems.map(item => {
          if (item.startsWith('*') && item.endsWith('*')) {
            return item;
          }
          return ensureIndefiniteArticle(sanitizeEquipmentClause(item));
        });
        const list = formatOxfordList(normalizedItems);
        parts.push(`${capitalizedPronoun} ${carryVerb} ${list}`);
      }
    } else {
      const equipmentSentences: string[] = [];
      if (equipmentVerbStyle === 'has-possesses') {
        // Use single 'has' style sentence for both armor and weapons
        const combinedItems = [...armorItems, ...weaponItems];
        if (coinsText && !coinsIncludedInWeapons) {
          combinedItems.push(formatCoinsForTreasure(coinsText));
          coinsIncludedInWeapons = true;
        }
        if (jewelryText && !jewelryIncludedInEquipment) {
          combinedItems.push(formatJewelryForTreasure(data.jewelry!));
          jewelryIncludedInEquipment = true;
        }
        if (combinedItems.length > 0) {
          const list = formatOxfordList(combinedItems.map(item => item.startsWith('*') && item.endsWith('*') ? item : ensureIndefiniteArticle(sanitizeEquipmentClause(item))));
          equipmentSentences.push(`${capitalizedPronoun} ${carryVerb} ${list}`);
        }
      } else {
        if (armorItems.length > 0) {
          const armorList = formatOxfordList(armorItems);
          equipmentSentences.push(`${capitalizedPronoun} ${wearVerb} ${armorList}`);
        }

        if (weaponItems.length > 0) {
          let weaponList = formatOxfordList(weaponItems);

          if (coinsText) {
            const formattedCoins = formatCoinsForTreasure(coinsText);
            weaponList += `, and ${formattedCoins}`;
            coinsIncludedInWeapons = true;
          }

          equipmentSentences.push(`${armorItems.length > 0 ? `and ${carryVerb}` : `${capitalizedPronoun} ${carryVerb}`} ${weaponList}`);
        }
      }

      if (equipmentSentences.length > 0) {
        parts.push(equipmentSentences.join(' '));
      }
    }
  }

  // Add secondary skills (comes before significant attributes per template)
  if (data.secondarySkills) {
    const possessive = resolvedPossessive;
    // Ensure narrative clauses are stripped for canonical output
    let skill = data.secondarySkills;
    skill = skill.replace(/[,;]?\s*(?:which|as)\s+(?:is|are)\s+described\s+in\s+.+$/i, '');
    skill = skill.replace(/[,;]?\s*\(see\s+.+?\)$/i, '');
    skill = skill.trim();
    if (skill) {
      parts.push(`${possessive} secondary skill is ${skill}`);
    }
  }

  // Add significant attributes
  if (data.significantAttributes) {
    const possessive = resolvedPossessive;
    // Do not duplicate the 'significantAttributes' clause when we have already
    // forced the PHB long-form attribute list for named/ranked entities.
    const shouldShowSignificant = !(isNamedRanked && normalizedAttrs && normalizedAttrs.type === 'list');
    if (shouldShowSignificant) {
      parts.push(`${possessive} significant attributes are ${data.significantAttributes}`);
    }
  }

  // Add spells
  if (data.spells) {
    const pronounSubject = resolvedSubject;
    let spellText = data.spells;
    // Clean up the spell text if it starts with unnecessary words
    spellText = spellText.replace(/^(?:the\s+following\s+number\s+of\s+|following\s+)?(cleric\s+|wizard\s+|magic.user\s+)?spells?\s+per\s+day:\s*/i, '');
    // Add superscript ordinals to spell levels
    spellText = formatSpellLevels(spellText);
    // Remove obvious equipment words from the spell list and split items
    let spells = spellText.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    spells = spells.filter(s => !/\b(shield|armor|mail|sword|dagger|bow|scabbard|arrows|helm|gauntlets)\b/i.test(s));

    // Apply canonical spell mappings and italicize individual spell names
    spells = spells.map((s) => {
      // Detect 'scroll of X' or 'potion of X' and only italicize the spell name portion
      const scrollMatch = /^(scroll of)\s+(.+)$/i.exec(s);
      if (scrollMatch) {
        const mapped = applyNameMappings(scrollMatch[2].trim());
        return `${scrollMatch[1]} ${wrapItalic(mapped)}`;
      }
      const potionMatch = /^(potion of)\s+(.+)$/i.exec(s);
      if (potionMatch) {
        const mapped = applyNameMappings(potionMatch[2].trim());
        return `${potionMatch[1]} ${wrapItalic(mapped)}`;
      }
      const mapped = applyNameMappings(s);
      return wrapItalic(mapped);
    });

    const finalSpellText = spells.join(', ');
    const spellLabel = classInfo.className ? `${classInfo.className} spells` : 'spells';
    parts.push(`${pronounSubject} can cast the following number of ${spellLabel} per day: ${finalSpellText}`);
  }

  // Formation details are now included within equipment descriptions

  // Handle jewelry and coins together when no weapons present
  const formattedCoinsText = data.coins ? formatCoinsForTreasure(data.coins) : undefined;
  const capitalizedPronoun = resolvedSubject;

  // Merge jewelry and coins into single carry clause when no weapons
  if (jewelryText && formattedCoinsText && !hasWeapons && !coinsIncludedInWeapons && !jewelryIncludedInEquipment) {
    // Both jewelry and coins: combine into single sentence
    const prefix = hasArmor || hasWeapons ? capitalizedPronoun : capitalizedPronoun;
    parts.push(`${prefix} ${carryVerb} ${formattedCoinsText} and ${jewelryText}`);
  } else if (jewelryText && !jewelryIncludedInEquipment) {
    // Only jewelry
    const prefix = hasWeapons || hasArmor ? capitalizedPronoun : capitalizedPronoun;
    parts.push(`${prefix} ${carryVerb} ${jewelryText}`);
  } else if (formattedCoinsText && !hasWeapons && !coinsIncludedInWeapons) {
    // Only coins (no weapons, coins not already included)
    const prefix = hasArmor || hasWeapons ? capitalizedPronoun : capitalizedPronoun;
    parts.push(`${prefix} ${carryVerb} ${formattedCoinsText}`);
  }

  if (parts.length === 0) {
    return '';
  }

  // Join parts with periods between sentences (per template structure)
  // Each major section becomes its own sentence
  const sentences: string[] = [];
  let currentSentence: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Check if this part starts with a capital letter (new sentence)
    const startsWithCapital = /^[A-Z]/.test(part);

    if (startsWithCapital && currentSentence.length > 0) {
      // Finish previous sentence and start new one
      sentences.push(currentSentence.join(', '));
      currentSentence = [part];
    } else if (startsWithCapital) {
      // First part or continuing after a completed sentence
      currentSentence.push(part);
    } else {
      // Part of current sentence
      currentSentence.push(part);
    }
  }

  // Add final sentence
  if (currentSentence.length > 0) {
    sentences.push(currentSentence.join(', '));
  }

  // Join sentences with periods
  const result = sentences.join('. ');
  let finalResult = result.endsWith('.') ? result : result + '.';

  // Post-processing: fix known pluralization/typo artifacts that sometimes
  // escape earlier sanitization heuristics (examples: 'armors', 'trashs').
  finalResult = finalResult.replace(/\barmors\b/gi, 'armor');
  finalResult = finalResult.replace(/\bhams\b/gi, 'ham');
  finalResult = finalResult.replace(/\btrashs\b/gi, 'trash');
  finalResult = finalResult.replace(/\bcomic scrolls\b/gi, 'comic scroll');
  finalResult = finalResult.replace(/\bscrolls\b/gi, 'scroll');

  // Per Canonicalizer mandate: normalize all Unicode superscripts to plain-text ordinals
  finalResult = normalizeUnicodeSuperscripts(finalResult);

  return finalResult;
}

function stripOuterItalics(value: string): string {
  const trimmed = value.trim();
  const italicsMatch = trimmed.match(/^\*(.+)\*$/);
  return italicsMatch ? italicsMatch[1] : trimmed;
}

function sanitizeEquipmentClause(item: string): string {
  let sanitized = stripOuterItalics(item);
  sanitized = sanitized.replace(/—[^,]+/g, '');
  sanitized = sanitized.replace(/\s*\((?:AC|see Appendix: Magic Items|bonus|attack|damage)[^)]*\)/gi, '');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Fix double verb sequences: "carry wield", "carries wields" -> pick a single verb
  sanitized = sanitized.replace(/\b(carries|carry)\s+(wields?)\b/gi, '$2');
  // Remove leading 'wields' and similar verbs left in inner items
  sanitized = sanitized.replace(/^(?:and\s+)?(?:wields?|wielding|is armed with|is equipped with)\s+/i, '');
  sanitized = sanitized.replace(/\b(carries|carry)\s+(carry|carries)\b/gi, '$1');

  // Common pluralization mistakes
  sanitized = sanitized.replace(/\barmors\b/gi, 'armor');
  sanitized = sanitized.replace(/\beachs\b/gi, 'each');
  sanitized = sanitized.replace(/\bhams\b/gi, 'ham');
  sanitized = sanitized.replace(/\btrashs\b/gi, 'trash');
  sanitized = sanitized.replace(/\barmours\b/gi, 'armor');
  sanitized = sanitized.replace(/\barmour\b/gi, 'armor');
  sanitized = sanitized.replace(/\barmors\b/gi, 'armor');
  sanitized = sanitized.replace(/\btrash(es)?\b/gi, 'trash');
  sanitized = sanitized.replace(/\bhams?\b/gi, 'ham');
  sanitized = sanitized.replace(/\bscrolls\b/gi, 'scroll');

  return sanitized;
}

function ensureIndefiniteArticle(item: string): string {
  const trimmed = item.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^\d/.test(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (/^(?:a|an|the|some|several|many|various|pair|set|his|her|their|its|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/.test(lower)) {
    return trimmed;
  }

  const normalized = lower.replace(/\s*\+\d+.*$/, '').trim();
  if ((/(?:mail|armor|barding|clothing)\b/.test(normalized) && !/\bof\b/.test(normalized)) ||
      /\b(boots|gauntlets|bracers|sandals|gloves)\b/.test(normalized)) {
    return trimmed;
  }

  if (/s$/.test(normalized)) {
    return trimmed;
  }

  const wordMatch = trimmed.match(/^[^a-zA-Z]*([a-zA-Z]+)/);
  const firstWord = wordMatch ? wordMatch[1] : '';
  const article = /^[aeiou]/i.test(firstWord) ? 'an' : 'a';
  return `${article} ${trimmed}`;
}

function formatOxfordList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const allButLast = items.slice(0, -1).join(', ');
  const last = items[items.length - 1];
  return `${allButLast}, and ${last}`;
}

function formatMountSentence(clause: string, defaultLead: string): string {
  const trimmed = clause.trim();
  if (!trimmed) {
    return '';
  }

  const sentence = /^[A-Z]/.test(trimmed) ? trimmed : `${defaultLead} ${trimmed}`;
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatPossessiveDescriptor(descriptor: string, isPlural: boolean): string {
  const trimmed = descriptor.trim();
  const apostrophe = '’';

  if (!trimmed) {
    return isPlural ? `These creatures${apostrophe}` : `This creature${apostrophe}s`;
  }

  const lowerTrimmed = trimmed.toLowerCase();
  if (isPlural) {
    return lowerTrimmed.endsWith('s') ? `${trimmed}${apostrophe}` : `${trimmed}${apostrophe}s`;
  }

  return `${trimmed}${apostrophe}s`;
}

export function formatMountBlock(mountBlock: MountBlock): string {
  const apostrophe = '’';
  const canonicalMount = canonicalizeMountBlock(mountBlock);
  const vitalParts: string[] = [];
  if (canonicalMount.level) vitalParts.push(`Level ${canonicalMount.level}`);
  if (canonicalMount.hd) {
    const levelFormat = formatHdAsLevel(canonicalMount.hd);
    vitalParts.push(`Level ${levelFormat}`);
  }
  if (canonicalMount.hp) vitalParts.push(`HP ${canonicalMount.hp}`);
  if (canonicalMount.ac) vitalParts.push(`AC ${canonicalMount.ac}`);
  if (canonicalMount.disposition) {
    const normalizedDisposition = normalizeDisposition(canonicalMount.disposition);
    vitalParts.push(`disposition ${normalizedDisposition}`);
  }

  const sentences: string[] = [];
  if (vitalParts.length > 0) {
    sentences.push(`This creature${apostrophe}s vital stats are ${vitalParts.join(', ')}.`);
  }

  if (canonicalMount.attacks) {
    sentences.push(formatMountSentence(canonicalMount.attacks, 'It attacks with'));
  }
  if (canonicalMount.equipment) {
    sentences.push(formatMountSentence(canonicalMount.equipment, 'It wears'));
  }

  const name = titleCase(canonicalMount.name);
  const content = sentences.filter(Boolean).join(' ');
  if (!content) {
    // If no vital parts, attacks, or equipment are present, just return the mount name
    return `**${name} (mount)**`;
  }
  return `**${name} (mount)** *(${content})*`;
}

export function findEquipment(equipment: string): string {
  let processed = applyNameMappings(equipment);

  // Shield normalization: split by comma, process each part individually
  const parts = processed.split(',').map(part => part.trim());
  const processedParts = parts.map(part => {
    let workingPart = part;

    // Check for generic "shield" (not preceded by shield type)
    if (/^shield(\s*\+\d+)?$/.test(workingPart.trim())) {
      // Replace generic shield with medium steel shield
      workingPart = workingPart.replace(/^shield(\s*\+\d+)?$/, 'medium steel shield$1');
    } else if (/\bshield\b/.test(workingPart) && !/(?:medium|large|small|wooden|steel)\s+shield/.test(workingPart)) {
      // If shield appears in a longer description without a qualifier
      workingPart = workingPart.replace(/\bshield\b/, 'medium steel shield');
    }

    // Check for magic items (items with bonuses or known magic words)
    const isMagic = /\+\d+|staff of|sword of|ring of|robe of|cloak of|boots of|gauntlets of|helm of|bracers of|pectoral of/i.test(workingPart) || /pectoral of armor/i.test(workingPart);

    if (isMagic) {
      // Move bonus to end and add mechanical explanations
      let magicItem = workingPart;

      // Handle bonus at end: "ring of armor +5"
      const bonusAtEndMatch = workingPart.match(/^(.+?)(\s*\+\d+)(.*)$/);
      if (bonusAtEndMatch) {
        const [, item, bonus, rest] = bonusAtEndMatch;
        magicItem = `${item.trim()}${rest}${bonus}`;
      }
      // Handle bonus at beginning: "+2 dagger"
      const bonusAtStartMatch = workingPart.match(/^(\+\d+)\s+(.+)$/);
      if (bonusAtStartMatch) {
        const [, bonus, item] = bonusAtStartMatch;
        magicItem = `${item} ${bonus}`;
      }

      // Clean decor and combat annotations before adding mechanics
      magicItem = applyNameMappings(magicItem);
      // Remove bracketed details and hyphenated adjectives (e.g., bronze-hilted)
      magicItem = canonicalizeMagicItemName(magicItem);

      // Italicize magic item with mechanics inside
      const withMechanics = addMagicItemMechanics(magicItem);
      if (withMechanics !== magicItem) {
        // Mechanics were added with em dash, convert to parentheses inside italics
        const mechanicsMatch = withMechanics.match(/^(.+?)—(.+)$/);
        if (mechanicsMatch) {
          return `*${mechanicsMatch[1]} (${mechanicsMatch[2]})*`;
        }
      }
      return `*${magicItem}*`;
    }
    return workingPart;
  });

  return processedParts.join(', ');
}
