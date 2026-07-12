// Canonical allergen names based on the EU 14 allergen list.
//
// The bold spans on e-food are not allergen names but allergen-carrying
// ingredients ("trappista sajt", "vaj", "zsemlemorzsa"), sometimes cut
// mid-word ("lutén", "ojás") or whole dish fragments. So this maps
// ingredient stems to canonical allergens, a span can yield several
// allergens ("túrós palacsinta" → tej + glutén would need both stems to
// hit), and anything unrecognized is dropped instead of stored as noise.
// The question side ("tejmentes", "laktózmentes") normalizes to the same
// canonical names so the SQL filter can match on equality.

const CANONICAL_STEMS: [RegExp, string][] = [
  // suffixes lengthen a final a/á and e/é ("szóját", "búzát") — stems stop
  // before the mutable vowel or allow both forms
  [
    /glutén|lutén|búz[aá]|árp[aá]|rozs|zab|liszt|tészt[aá]|zsemle|morzs[aá]|gríz|panír|durum|makaróni|spagetti|penne|galusk[aá]|kuszkusz|bulgur|piskót[aá]|palacsint[aá]/i,
    'glutén',
  ],
  [/földimogyoró/i, 'földimogyoró'],
  [/mogyoró|dió|mandul[aá]|kesu|pisztáci|pekán|makadámi/i, 'diófélék'],
  [
    /tej|laktóz|sajt|vaj|joghurt|túró|tejföl|tejszín|mascarpone|ricott[aá]|mozzarell[aá]|parmezán|parmiggiano|kefir|savó/i,
    'tej',
  ],
  [/tojás|ojás|majonéz|tartár|palacsint[aá]|piskót[aá]/i, 'tojás'],
  [/szój[aá]/i, 'szója'],
  [/rák/i, 'rákfélék'],
  [/puhatestű|kagyló|csig[aá]|tintahal|polip/i, 'puhatestűek'],
  [
    /\bhal|harcs[aá]|tonhal|tőkehal|sügér|bus[aá]|keszeg|ponty|ponyt|lazac|hering|makrél[aá]|szardíni[aá]/i,
    'hal',
  ],
  [/zeller/i, 'zeller'],
  [/mustár/i, 'mustár'],
  [/szezám/i, 'szezámmag'],
  [/szulfit|kén-?dioxid|borkén/i, 'szulfitok'],
  [/csillagfürt/i, 'csillagfürt'],
];

export function normalizeAllergens(raw: string): string[] {
  const cleaned = raw.trim().toLowerCase();
  // földimogyoró would otherwise also hit the tree-nut stem /mogyoró/
  const withoutPeanut = cleaned.replace(/földimogyoró\S*/g, ' ');

  const matches = new Set<string>();
  for (const [stem, canonical] of CANONICAL_STEMS) {
    const target = canonical === 'földimogyoró' ? cleaned : withoutPeanut;
    if (stem.test(target)) {
      matches.add(canonical);
    }
  }
  return [...matches];
}

// "tejmentes", "tej nélkül", "laktózmentes" → exclude 'tej', etc.
const EXCLUSION_PATTERNS: [RegExp, string][] = [
  [/(tej|laktóz)[ -]?mentes|tej nélkül/i, 'tej'],
  [/glutén[ -]?mentes|glutén nélkül/i, 'glutén'],
  [/tojás[ -]?mentes|tojás nélkül/i, 'tojás'],
  [/szója[ -]?mentes|szója nélkül/i, 'szója'],
  [/hal[ -]?mentes|hal nélkül/i, 'hal'],
  [/mogyoró[ -]?mentes|dió[ -]?mentes/i, 'diófélék'],
];

export function extractExcludedAllergens(question: string): string[] {
  const excluded = new Set<string>();
  for (const [pattern, canonical] of EXCLUSION_PATTERNS) {
    if (pattern.test(question)) {
      excluded.add(canonical);
    }
  }
  return [...excluded];
}
