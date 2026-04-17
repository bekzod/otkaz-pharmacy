const LATIN_TO_CYRILLIC_LAYOUT = {
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
  '/': '.',
};

const LATIN_TO_CYRILLIC_TRANSLIT_MULTI = [
  ['shch', 'щ'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['ye', 'е'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['ch', 'ч'],
  ['sh', 'ш'],
];

const LATIN_TO_CYRILLIC_TRANSLIT_SINGLE = {
  a: 'а',
  b: 'б',
  c: 'с',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'х',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'к',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'в',
  x: 'кс',
  y: 'й',
  z: 'з',
};

const LATIN_MEDICINE_PHONETIC_REPLACEMENTS = [
  [/si(?=t)/gu, 'ce'],
  [/se(?=t)/gu, 'ce'],
  [/ph/gu, 'f'],
];

const CYRILLIC_MEDICINE_PHONETIC_REPLACEMENTS = [
  [/си(?=т)/gu, 'це'],
  [/се(?=т)/gu, 'це'],
];

const MEDICINE_FORM_PHRASE_NORMALIZERS = [
  [/со\s+вкусом\s+/gu, ' '],
  [/со\s+вкус\.?\s+/gu, ' '],
  [/с\s+сахар\.?/gu, ' '],
  [/к\s*-\s*та/gu, ' '],
  [/для\s+детей/gu, ' '],
  [/для\s+взрослых/gu, ' '],
  [/по\s+\d+\s+шт\.?/gu, ' '],
  [/доктор\s+мом\s+сон/gu, 'доктор момсон'],
  [/одно(?:разов[а-я]*)?\.?\s+прим(?:\.|ен[а-я]*)?/gu, ' '],
  [/\(?\s*с\s+раст\s*-\s*л[яья]+\s*\)?/gu, ' '],
  [/растительн[а-я]*\s+от\s+кашл[яа]/gu, ' '],
  [/упаковк[а-я]*\s+контурн[а-я]*\s+ячейков[а-я]*/gu, ' блистер '],
  [/контейнер[а-я]*\s+полипропиленов[а-я]*/gu, ' '],
  [/капсул[а-я]*\s+с\s+модифицированн[а-я]*\s+высвобождени[а-я]*/gu, 'капс'],
  [/таблетк[а-я]*\s+с\s+модифицированн[а-я]*\s+высвобождени[а-я]*/gu, 'таб'],
  [/таблетк[а-я]*\s+пролонгированн[а-я]*\s+действи[а-я]*/gu, 'таб'],
  [/таблетк[а-я]*\s+жевательн[а-я]*/gu, 'таб'],
  [/суппозитори[а-я]*(?:\s+ректальн[а-я]*|\s+вагинальн[а-я]*)?/gu, 'супп'],
  [/пастилк[а-я]*/gu, ' пастилки '],
  [/пастил(?!к)[а-я]*/gu, 'паст'],
  [/гранул[а-я]*\s+шипуч[а-я]*/gu, 'гран'],
  [
    /гранул[а-я]*\s+для\s+приготовлен[а-я]*\s+суспензи[а-я]*(?:\s+для\s+прием[а-я]*\s+внутр[а-я]*)?/gu,
    'гран',
  ],
  [/гел[а-я]*\s+для\s+носов[а-я]*\s+полост[а-я]*/gu, 'гель'],
  [/аэрозол[а-я]*\s+для\s+ингаляци[а-я]*/gu, 'инг'],
  [/ингаляционн[а-я]*\s+раствор[а-я]*\s+для\s+распылени[а-я]*/gu, 'инг'],
  [
    /порошок\s+лиофилизирован[а-я]*\s+для\s+приготовлен[а-я]*\s+раствор[а-я]*\s+для\s+инъекци[а-я]*/gu,
    ' пор ',
  ],
  [/лиофилизат\s+для\s+внутривенн[а-я]*\s+и\s+внутримышечн[а-я]*\s+введен[а-я]*/gu, ' пор '],
  [/порошок\s+для\s+приготовлен[а-я]*\s+инъекционн[а-я]*\s+р\s*[- ]\s*р[а-я]*/gu, ' пор '],
  [/порошок\s+для\s+приготовлен[а-я]*\s+раствор[а-я]*(?:\s+для\s+инъекци[а-я]*)?/gu, ' пор '],
  [
    /порошок\s+для\s+приготовлен[а-я]*\s+суспензи[а-я]*(?:\s+для\s+прием[а-я]*\s+внутр[а-я]*)?/gu,
    ' пор ',
  ],
  [/д\s*\/\s*пр\.?\s+р\s*-\s*р[а-я]*\s+д\s*\/\s*ин(?!ф)\.?/gu, ' '],
  [/д\s*\/\s*пр\.?\s+р\s*-\s*р[а-я]*\s+д\s*\/\s*инф\.?/gu, ' '],
  [/д\s*\/\s*пр\.?\s+р\s*-\s*р[а-я]*/gu, ' '],
  [/д\s*\/\s*пр\.?\s+сусп[а-я]*\.?/gu, ' '],
  [/д\s*\/\s*ин(?!г|ф)[а-я]*\.?/gu, ' '],
  [/д\s*\/\s*инф[а-я]*\.?/gu, ' '],
  [/пор\.?\s*д\s*\/\s*ин[а-я]*\.?/gu, ' '],
  [/раствор\s+для\s+инъекци[а-я]*/gu, ' '],
  [/раствор\s+для\s+внутривенн[а-я]*\s+введен[а-я]*/gu, ' '],
  [/раствор\s+для\s+внутривенн[а-я]*\s+и\s+внутримышечн[а-я]*\s+введен[а-я]*/gu, ' '],
  [/раствор\s+для\s+внутримышечн[а-я]*\s+введен[а-я]*/gu, ' '],
  [/раствор\s+для\s+инфузи[а-я]*/gu, ' '],
  [/раствор\s+для\s+внутривенн[а-я]*\s+инфузи[а-я]*/gu, ' '],
  [/раствор\s+для\s+прием[а-я]*\s+внутр[а-я]*/gu, ' '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*прием[а-я]*\s+внутр[а-я]*/gu, ' раствор '],
  [/концентрат\s+д\s*\/\s*приг\.?\s*р\s*-\s*р[а-я]*/gu, ' раствор '],
  [/конц\.?\s*д\s*\/\s*приг\.?\s*р\s*-\s*р[а-я]*/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*внутр(?:ь|\.?)/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*пр\.?\s*внутр(?:ь|\.?)/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*орал\.?/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*ингаляци[а-я]*/gu, ' инг '],
  [/р\s*-\s*р\.?\s*для\s*ингаляци[а-я]*/gu, ' инг '],
  [/д\s*\/\s*ингаляци[а-я]*/gu, ' инг '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*ин(?!ф)[а-я]*\.?/gu, ' амп '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*инф[а-я]*\.?/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*для\s*\/\s*инф[а-я]*\.?/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*для\s*инф[а-я]*\.?/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*инф[а-я]*\.?/gu, ' раствор '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*в\.?\s*в\.?/gu, ' амп '],
  [/р\s*-\s*р\.?\s*д\s*\/\s*п\s*\/\s*к\.?\s*ин\.?/gu, ' амп '],
  [/раствор\s+для\s+полоскан[а-я]*/gu, ' '],
  [/раствор\s+для\s+наружн[а-я]*\s+применен[а-я]*/gu, ' '],
  [/раствор\s+для\s+местн[а-я]*\s+применен[а-я]*/gu, ' '],
  [/суспензи[а-я]*\s+для\s+прием[а-я]*\s+внутр[а-я]*/gu, ' '],
  [/таблетк[а-я]*\s+диспергир[а-я]*\s+в\s+полост[а-я]*\s+рт[а-я]*/gu, 'таб'],
  [/таблетк[а-я]*\s+для\s+рассасыван[а-я]*\s+блистер[а-я]*/gu, 'таб'],
  [/таблетк[а-я]*\s+для\s+рассасыван[а-я]*/gu, 'таб'],
  [/таб(?:\.|л\.?|летк[а-я]*)?\s*п\s*\/\s*о\.?/gu, 'таб'],
  [/таблетк[а-я]*\s*,?\s*покрыт[а-я]*\s+пленочн[а-я]*\s+оболочк[а-я]*/gu, 'таб'],
  [/таблетк[а-я]*\s*,?\s*покрыт[а-я]*\s+оболочк[а-я]*/gu, 'таб'],
  [
    /таблетк[а-я]*\s*,?\s*покрыт[а-я]*\s+кишечнорастворим[а-я]*\s+пленочн[а-я]*\s+оболочк[а-я]*/gu,
    'таб',
  ],
  [
    /таблетк[а-я]*\s*,?\s*покрыт[а-я]*\s+пленочн[а-я]*\s+кишечнорастворим[а-я]*\s+оболочк[а-я]*/gu,
    'таб',
  ],
  [/капсул[а-я]*\s+кишечнорастворим[а-я]*/gu, 'капс'],
  [/аэр\.?\s*д\s*\/\s*инг\.?/gu, 'аэрозоль'],
  [/спрей\s+орал[а-я]*/gu, 'спрей'],
  [/орал[а-я]*\s+спрей/gu, 'спрей'],
  [/спрей\s+назал[а-я]*(?:\s+раствор)?/gu, 'спрей'],
  [/капсул[а-я]*\s+кишечнорастворим[а-я]*\s+блистер[а-я]*/gu, 'капс'],
  [/спрей\s+для\s+ротов[а-я]*\s+полост[а-я]*/gu, 'спрей'],
  [/капл[а-я]*\s+для\s+прием[а-я]*\s+внутр[а-я]*/gu, 'капли'],
  [/сироп\s+для\s+прием[а-я]*\s+внутр[а-я]*/gu, 'сироп'],
  [/небул[а-я]*/gu, ' инг '],
  // Generic route-abbreviation cleanup. Runs AFTER the specific route→form
  // mappings above (e.g. "р-р д/п/к ин." → "амп") so those still get priority.
  [/(?<![а-яё])[а-я]\s*\/\s*[а-я](?:\s*\/\s*[а-я])+\.?(?:\s+введ[а-я]*\.?)?/gu, ' '],
  [/(?<![а-яё])(?:в\s*\/\s*в|в\s*\/\s*м|п\s*\/\s*к)\.?\s+введ[а-я]*\.?/gu, ' '],
];

function normalizeMedicineFormPhrases(value) {
  let normalized = String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е');

  for (const [pattern, replacement] of MEDICINE_FORM_PHRASE_NORMALIZERS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

function normalizeQuery(value) {
  return normalizeMedicineFormPhrases(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function convertLatinLayoutToCyrillic(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((char) => LATIN_TO_CYRILLIC_LAYOUT[char] || char)
    .join('');
}

function transliterateLatinToCyrillic(value) {
  const input = String(value || '').toLowerCase();
  let result = '';
  let index = 0;

  while (index < input.length) {
    let matched = false;

    for (const [latin, cyrillic] of LATIN_TO_CYRILLIC_TRANSLIT_MULTI) {
      if (input.startsWith(latin, index)) {
        result += cyrillic;
        index += latin.length;
        matched = true;
        break;
      }
    }

    if (matched) {
      continue;
    }

    const char = input[index];
    result += LATIN_TO_CYRILLIC_TRANSLIT_SINGLE[char] || char;
    index += 1;
  }

  // In Russian loanwords, л before a consonant is palatalized: л → ль.
  // e.g. salbutamol → сальбутамол, alfentanil → альфентанил, valproate → вальпроат
  // Uses negative lookahead: "л followed by any letter that is NOT a vowel, й, ь, ъ, or л itself"
  // so double-л (allopurinol → аллопуринол) and word-final л are left unchanged.
  return result.replace(/л(?=\p{L})(?![аеёийоуыэюяьъл])/gu, 'ль');
}

function buildLatinMedicinePhoneticVariants(value) {
  const normalized = normalizeQuery(value);
  if (!normalized) return [];

  const variants = [];

  for (const [pattern, replacement] of LATIN_MEDICINE_PHONETIC_REPLACEMENTS) {
    const phoneticVariant = normalizeQuery(normalized.replace(pattern, replacement));
    if (phoneticVariant && phoneticVariant !== normalized) {
      variants.push(phoneticVariant);
    }
  }

  return [...new Set(variants)];
}

function buildCyrillicMedicinePhoneticVariants(value) {
  const normalized = normalizeQuery(value);
  if (!normalized) return [];

  const variants = [];

  for (const [pattern, replacement] of CYRILLIC_MEDICINE_PHONETIC_REPLACEMENTS) {
    const phoneticVariant = normalizeQuery(normalized.replace(pattern, replacement));
    if (phoneticVariant && phoneticVariant !== normalized) {
      variants.push(phoneticVariant);
    }
  }

  return [...new Set(variants)];
}

function buildQueryVariants(rawQuery) {
  const original = normalizeQuery(rawQuery);
  const layoutConverted = normalizeQuery(convertLatinLayoutToCyrillic(rawQuery));
  const transliterated = normalizeQuery(transliterateLatinToCyrillic(rawQuery));
  const latinPhoneticVariants = [
    ...buildLatinMedicinePhoneticVariants(original),
    ...buildLatinMedicinePhoneticVariants(layoutConverted),
    ...buildLatinMedicinePhoneticVariants(transliterated),
  ];
  const cyrillicPhoneticVariants = [
    ...buildCyrillicMedicinePhoneticVariants(transliterated),
    ...latinPhoneticVariants
      .map((variant) => normalizeQuery(transliterateLatinToCyrillic(variant)))
      .filter(Boolean),
  ].flatMap((variant) => [variant, ...buildCyrillicMedicinePhoneticVariants(variant)]);

  return [
    ...new Set(
      [
        original,
        layoutConverted,
        transliterated,
        ...cyrillicPhoneticVariants,
        ...latinPhoneticVariants,
      ].filter((variant) => variant.length > 0),
    ),
  ];
}

module.exports = {
  buildQueryVariants,
  buildLatinMedicinePhoneticVariants,
  buildCyrillicMedicinePhoneticVariants,
  normalizeMedicineFormPhrases,
  normalizeQuery,
  transliterateLatinToCyrillic,
  LATIN_TO_CYRILLIC_TRANSLIT_SINGLE,
  LATIN_TO_CYRILLIC_TRANSLIT_MULTI,
};
