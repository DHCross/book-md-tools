// Simple verification harness for classification rules (node)
// Mirrors the key predicates from electron/src/renderer.js

const genericMonsters = [
  'ape','bandit','bear','bat','boar','bugbear','centipede','beetle',
  'elf','gnoll','goblin','griffon','hobgoblin','kobold','lion',
  'lizardfolk','losel','commoner','naga','nixie','orc','otter',
  'owlbear','rat','riverman','snake','spider','stirge','stirges','thief',
  'turtle','wolf','wolverine','ogre','children','batrachianoid',
  'harpy','tick','mastiff','animal','herd','brigand','giant','black',
  'cave','wild','mountain','forest','river','huge','grey','gray','small',
  'large','medium','deadly','poisonous','carnivous','carnivorous',
  'slime','ooze','ghoul','ghouls','wraith','lich','mummy','vampire',
  'dragon','fungus','mold','rats','snakes','gnoll','green','snapping','normal','dire'
];

const explicitUniqueNames = /\b(charlie|pinky|wily wil|yeexuul|gruzz kree|king krusher|hub-gub|griggle-gruk|fekk|ember raventree|grimlock|ji'gun-tima|iggy the mad|blook-glook|ug-muk'tik|grug-much|robert cooper|oni blackbeard|wilbur hornblower)\b/i;
const titleWithProperName = /\b[A-Z][a-z0-9'`-]*(?:\s+[A-Z][a-z0-9'`-]*)*\s+(shaman|chieftain|leader|mate|lieutenant)\b/;

function hasCharacterLevel(combined) {
  return /(\d+(?:st|nd|rd|th)[-–]\d+(?:st|nd|rd|th)?\s+level|level\s+(fighter|cleric|magic-user|thief|ranger|druid|bard|paladin|monk))/i.test(combined);
}

function isMonster(combined, text) {
  if (/(dragon|goblin|gnoll|orc|troll|kobold|bugbear|hobgoblin|skeleton|zombie|ghoul|ghast|wraith|specter|lich|mummy|vampire|demon|devil|fiend|ogre|giant|beast|slime|ooze|gelatinous|fungus|mold|worm|centipede|spider|rat|bat|wolf|bear|boar|lion|griffon|wyvern|basilisk|naga|losel|lizardfolk|bandit|brigand|ape|turtle|snapping|snake|poisonous|deadly|otter|nixie|stirge|stirges|mastiff|animal|herd|bison|cattle|deer|elk)/i.test(combined)) return true;
  if (/monster|creature|spawn/i.test(text)) return true;
  if (/(guards?|warriors?|males?|females?|young|cubs?|raiders?|patrol|sentries)\s+x\s*\d+/i.test(combined)) return true;
  if (/(cave\s+bats?|river\s+rats?|giant\s+rats?|black\s+bear|wood\s+elf|poisonous\s+snake)/i.test(combined)) return true;
  return false;
}

function detectNamedNPC(name, combined, text) {
  if (!name || name.length < 3) return false;

  if (/\b(x\s*\d+|\d+\s*x|patrol|warriors?|guards?|sentries|males?|females?|young|raiders?|scouts?)\b/i.test(name)) return false;

  // first word check
  const firstWord = name.split(/[,\s]+/)[0].toLowerCase();
  if (genericMonsters.includes(firstWord)) return false;

  // role-based titles without proper name are not named
  if (/^(brigand|bandit|guard|warrior|scout|raider|sentry|patrol)\b/i.test(name)) return false;

  if (/['\"]/.test(name)) return true;

  // proper name heuristic
  const words = name.split(/\s+/);
  const hasProperName = words.some(word => /^[A-Z]/.test(word) && !['the','king','queen','chief','chieftain','leader','lord','lady','sir','captain','lieutenant','serjeant','shaman','priest'].includes(word.toLowerCase()) && !genericMonsters.includes(word.toLowerCase()));
  if (hasProperName) return true;

  // unique NPC detection: explicit list or proper-name+title
  if (explicitUniqueNames.test(combined)) return true;
  if (titleWithProperName.test(name || combined)) return true;

  return false;
}

function classify(name, combined = name, text = '') {
  const named = detectNamedNPC(name, combined, text);
  const monster = isMonster(combined, text);
  const level = hasCharacterLevel(combined);

  if (named || level || /\bnpc\b/i.test(combined)) {
    return { name, category: named ? 'npc-named' : 'npc', named, monster, level };
  }

  if (monster) return { name, category: 'monster', named: false, monster: true, level };

  return { name, category: 'feature', named: false, monster: false, level };
}

const samples = [
  'Bugbear', 'Ghoul', 'Gnoll', 'Griffon', 'Hobgoblin', 'Kobold', 'Lizardfolk', 'Nixies (sprite)', 'Orc', 'Stirges',
  'Goblin, leader (corporal)', 'Goblin shaman', 'Grimlock Manface (Losel Chieftain)', 'Wood Elf Scouts x 11', 'Mastiff'
];

for (const s of samples) {
  const res = classify(s, s);
  console.log(`${s}: ${res.category}   (named=${res.named} monster=${res.monster} level=${res.level})`);
}

process.exit(0);
