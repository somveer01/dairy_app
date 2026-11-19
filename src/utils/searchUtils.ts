/**
 * Search & Matching Utility for Dairy App
 * 
 * Features:
 * 1. Prefix (Starts-With) Prioritization:
 *    - 1-2 character queries strictly match beginning of words or phone numbers.
 *      (e.g., 'R' only matches 'Ramesh', 'Rakesh', 'Singh Ramesh', NOT 'Suresh').
 * 2. Sound-Alike / Phonetic Normalization:
 *    - V <-> B (Vikas <-> Bikas)
 *    - EE / EA <-> I (Deepak <-> Dipak, Suneel <-> Sunil)
 *    - OO / OU <-> U (Babloo <-> Bablu, Pooja <-> Puja)
 *    - SH <-> S (Suresh <-> Sures, Sharma <-> Sarma)
 *    - Double consonants collapsed (Kallu <-> Kalu, Babbu <-> Babu)
 *    - Aspirated consonant tolerance (DH <-> D, BH <-> B, TH <-> T, KH <-> K)
 * 3. Fuzzy Spelling Tolerance (Levenshtein Distance):
 *    - Missed/extra character tolerated for typos (e.g. 'Rmesh' matches 'Ramesh').
 * 4. Cross-Script Devanagari (Hindi <-> English) Prefix Support:
 *    - Typing 'r' matches 'रमेश', typing 'र' matches 'Ramesh'.
 * 5. Phone & Address Matching:
 *    - Digits match anywhere in phone numbers (e.g. last 4 digits).
 */

// Mapping of primary Devanagari consonants to English phonetic prefixes
const HINDI_TO_ENG_MAP: Record<string, string[]> = {
  'अ': ['a'], 'आ': ['a', 'aa'], 'इ': ['i'], 'ई': ['ee', 'i'],
  'उ': ['u'], 'ऊ': ['oo', 'u'], 'ए': ['e'], 'ऐ': ['ai'],
  'ओ': ['o'], 'औ': ['au'],
  'क': ['k', 'c'], 'ख': ['kh'], 'ग': ['g'], 'घ': ['gh'],
  'च': ['ch'], 'छ': ['chh', 'ch'], 'ज': ['j', 'z'], 'झ': ['jh'],
  'ट': ['t'], 'ठ': ['th'], 'ड': ['d'], 'ढ': ['dh'], 'ण': ['n'],
  'त': ['t'], 'थ': ['th'], 'द': ['d'], 'ध': ['dh'], 'न': ['n'],
  'प': ['p'], 'फ': ['f', 'ph'], 'ब': ['b', 'v'], 'भ': ['bh', 'b'], 'म': ['m'],
  'य': ['y'], 'र': ['r'], 'ल': ['l'], 'व': ['v', 'w', 'b'],
  'श': ['sh', 's'], 'ष': ['sh', 's'], 'स': ['s', 'sh'], 'ह': ['h']
};

const ENG_TO_HINDI_MAP: Record<string, string[]> = {
  'a': ['अ', 'आ'], 'b': ['ब', 'भ', 'व'], 'c': ['क', 'च', 'स'],
  'd': ['द', 'ड', 'ध', 'ढ'], 'e': ['ए', 'इ'], 'f': ['फ'],
  'g': ['ग', 'घ'], 'h': ['ह'], 'i': ['इ', 'ई'], 'j': ['ज', 'झ'],
  'k': ['क', 'ख'], 'l': ['ल'], 'm': ['म'], 'n': ['न', 'ण'],
  'o': ['ओ'], 'p': ['प', 'फ'], 'q': ['क'], 'r': ['र'],
  's': ['स', 'श', 'ष'], 't': ['त', 'ट', 'थ', 'ठ'], 'u': ['उ', 'ऊ'],
  'v': ['व', 'ब'], 'w': ['व', 'ब'], 'y': ['य'], 'z': ['ज']
};

/**
 * Normalizes an English string phonetically for Indian names
 */
export function normalizePhonetic(input: string): string {
  if (!input) return '';
  let s = input.toLowerCase().trim();

  // Normalize accented characters
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Common Indian sound-alikes:
  s = s.replace(/ee|ea/g, 'i');
  s = s.replace(/oo|ou/g, 'u');
  s = s.replace(/ph/g, 'f');
  s = s.replace(/v|w/g, 'b'); // Vikas -> Bikas
  s = s.replace(/sh/g, 's'); // Suresh -> Sures, Sharma -> Sarma
  s = s.replace(/z/g, 'j');
  s = s.replace(/c(?=[eiy])/g, 's'); // Soft c -> s
  s = s.replace(/c(?=[aou])/g, 'k'); // Hard c -> k
  s = s.replace(/ck/g, 'k');

  // 2. Collapse aspirated consonants: bh->b, dh->d, th->t, kh->k, gh->g, ch->c, jh->j
  s = s.replace(/bh/g, 'b');
  s = s.replace(/dh/g, 'd');
  s = s.replace(/th/g, 't');
  s = s.replace(/kh/g, 'k');
  s = s.replace(/gh/g, 'g');
  s = s.replace(/jh/g, 'j');

  // 3. Collapse double consonants: ll->l, mm->m, tt->t, etc.
  s = s.replace(/([a-z])\1+/g, '$1');

  return s;
}

/**
 * Fast Levenshtein distance between two short strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

export interface MatchScore {
  isMatch: boolean;
  score: number; // Higher is better (e.g. 100 for exact prefix, 80 for word prefix, 50 for phonetic, 30 for fuzzy)
}

/**
 * Computes how well target text matches query
 */
export function calculateMatchScore(
  target: { name?: string; phone?: string; address?: string },
  rawQuery: string
): MatchScore {
  const query = rawQuery.trim();
  if (!query) return { isMatch: true, score: 0 };

  const queryLower = query.toLowerCase();
  const queryLen = query.length;
  const isNumericQuery = /^\d+$/.test(query);

  // 1. Phone number match (if query has digits)
  if (target.phone) {
    const cleanPhone = target.phone.replace(/\D/g, '');
    const cleanQuery = query.replace(/\D/g, '');
    if (cleanQuery.length > 0 && cleanPhone.includes(cleanQuery)) {
      if (cleanPhone.endsWith(cleanQuery)) {
        return { isMatch: true, score: 120 }; // Exact suffix match (last digits)
      }
      return { isMatch: true, score: 95 };
    }
    if (isNumericQuery) {
      // Query is strictly numbers and phone didn't match
      return { isMatch: false, score: 0 };
    }
  }

  const name = (target.name || '').trim();
  const nameLower = name.toLowerCase();
  const words = nameLower.split(/\s+/).filter(Boolean);

  // --- SHORT QUERY (1 OR 2 CHARACTERS) ---
  // Strictly StartsWith / Prefix matching
  if (queryLen <= 2) {
    // A. Direct prefix on full name
    if (nameLower.startsWith(queryLower)) {
      return { isMatch: true, score: 100 };
    }

    // B. Prefix on any word in the name (e.g. 'R' matches 'Singh Ramesh')
    for (const w of words) {
      if (w.startsWith(queryLower)) {
        return { isMatch: true, score: 85 };
      }
    }

    // C. Cross-script Hindi <-> English first letter match
    // If query is English (e.g. 'r') and name starts with Hindi 'र'
    const hindiChars = ENG_TO_HINDI_MAP[queryLower[0]];
    if (hindiChars && name.length > 0) {
      const firstChar = name[0];
      if (hindiChars.includes(firstChar)) {
        return { isMatch: true, score: 90 };
      }
      for (const w of words) {
        if (hindiChars.includes(w[0])) {
          return { isMatch: true, score: 80 };
        }
      }
    }

    // If query is Hindi (e.g. 'र') and name starts with English 'R'
    const engPrefixes = HINDI_TO_ENG_MAP[query[0]];
    if (engPrefixes) {
      for (const ep of engPrefixes) {
        if (nameLower.startsWith(ep)) return { isMatch: true, score: 90 };
        for (const w of words) {
          if (w.startsWith(ep)) return { isMatch: true, score: 80 };
        }
      }
    }

    // For 1-2 chars, do not perform loose substring search to prevent list pollution
    return { isMatch: false, score: 0 };
  }

  // --- QUERY LENGTH >= 3 ---

  // 1. Exact full starts-with
  if (nameLower.startsWith(queryLower)) {
    return { isMatch: true, score: 100 };
  }

  // 2. Any word starts-with
  for (const w of words) {
    if (w.startsWith(queryLower)) {
      return { isMatch: true, score: 85 };
    }
  }

  // 3. Substring match
  if (nameLower.includes(queryLower)) {
    return { isMatch: true, score: 70 };
  }

  // 4. Address match
  if (target.address && target.address.toLowerCase().includes(queryLower)) {
    return { isMatch: true, score: 60 };
  }

  // 5. Phonetic / Sound-Alike Matching (Vikas <-> Bikas, Deepak <-> Dipak, Kallu <-> Kalu)
  const normQuery = normalizePhonetic(queryLower);
  const normName = normalizePhonetic(nameLower);

  if (normName.startsWith(normQuery)) {
    return { isMatch: true, score: 75 };
  }

  const normWords = normName.split(/\s+/).filter(Boolean);
  for (const nw of normWords) {
    if (nw.startsWith(normQuery) || nw.includes(normQuery)) {
      return { isMatch: true, score: 65 };
    }
  }

  // 6. Fuzzy Spelling Mistake Tolerance (Levenshtein Distance on words)
  // Tolerates missed or extra character (e.g. 'Rmesh' -> 'Ramesh', 'Mukes' -> 'Mukesh')
  const maxDistance = queryLen <= 5 ? 1 : 2;

  for (const w of words) {
    // If length is comparable
    if (Math.abs(w.length - queryLower.length) <= maxDistance) {
      const dist = levenshteinDistance(w, queryLower);
      if (dist <= maxDistance) {
        return { isMatch: true, score: 50 - dist * 5 };
      }
    }
    // Also test distance against phonetically normalized words
    const normW = normalizePhonetic(w);
    if (Math.abs(normW.length - normQuery.length) <= maxDistance) {
      const dist = levenshteinDistance(normW, normQuery);
      if (dist <= maxDistance) {
        return { isMatch: true, score: 45 - dist * 5 };
      }
    }
  }

  return { isMatch: false, score: 0 };
}

/**
 * Filter and sort a list of items based on smart search query
 */
export function filterBySmartSearch<T>(
  items: T[],
  query: string,
  getFieldExtractor: (item: T) => { name?: string; phone?: string; address?: string }
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items;

  const scoredItems: { item: T; score: number }[] = [];

  for (const item of items) {
    const fields = getFieldExtractor(item);
    const match = calculateMatchScore(fields, trimmed);
    if (match.isMatch) {
      scoredItems.push({ item, score: match.score });
    }
  }

  // Sort by highest score first (highest relevance at the top)
  scoredItems.sort((a, b) => b.score - a.score);

  return scoredItems.map(s => s.item);
}
