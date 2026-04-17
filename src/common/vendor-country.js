function normalizeSqlTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

const VENDOR_TABLE_COUNTRIES = [
  'австралия',
  'австрия',
  'азербайджан',
  'албания',
  'аргентина',
  'армения',
  'бангладеш',
  'беларусь',
  'бельгия',
  'болгария',
  'босния и герцеговина',
  'бразилия',
  'великобритания',
  'венгрия',
  'вьетнам',
  'германия',
  'гонконг',
  'греция',
  'грузия',
  'дания',
  'доминиканская республика',
  'египет',
  'израиль',
  'индия',
  'индонезия',
  'иордания',
  'иран',
  'ирландия',
  'исландия',
  'испания',
  'италия',
  'казахстан',
  'канада',
  'кипр',
  'китай',
  'колумбия',
  'куба',
  'кыргызстан',
  'латвия',
  'литва',
  'люксембург',
  'македония',
  'малайзия',
  'мальта',
  'мексика',
  'молдова',
  'нидерланды',
  'новая зеландия',
  'норвегия',
  'оаэ',
  'пакистан',
  'палестина',
  'польша',
  'португалия',
  'пуэрто рико',
  'россия',
  'румыния',
  'саудовская аравия',
  'северная корея',
  'сербия',
  'сингапур',
  'словакия',
  'словения',
  'сша',
  'таджикистан',
  'таиланд',
  'тайвань',
  'турция',
  'узбекистан',
  'украина',
  'финляндия',
  'франция',
  'хорватия',
  'черногория',
  'чешская республика',
  'чили',
  'швейцария',
  'швеция',
  'шри-ланка',
  'эстония',
  'юар',
  'южная корея',
  'япония',
];

const COUNTRY_ALIAS_GROUPS = [
  ['индия', 'india'],
  ['узбекистан', 'uzbekistan', 'uz', 'uzb'],
  ['китай', 'china', 'cn'],
  ['сша', 'usa', 'us', 'соединенные штаты', 'соединенные штаты америки'],
  ['россия', 'russia', 'rf', 'рф'],
  ['турция', 'turkey'],
  ['германия', 'germany'],
  ['франция', 'france'],
  ['италия', 'italy'],
  ['испания', 'spain'],
  ['украина', 'ukraine'],
  ['беларусь', 'belarus', 'белоруссия'],
  ['казахстан', 'kazakhstan'],
  ['кыргызстан', 'kyrgyzstan', 'киргизия'],
  ['таджикистан', 'tajikistan'],
  ['армения', 'armenia'],
  ['грузия', 'georgia'],
  ['польша', 'poland'],
  ['швейцария', 'switzerland'],
  ['словения', 'slovenia'],
  ['венгрия', 'hungary'],
];

const COUNTRY_ALIAS_TO_CANONICAL = new Map();

for (const country of VENDOR_TABLE_COUNTRIES) {
  COUNTRY_ALIAS_TO_CANONICAL.set(normalizeSqlTerm(country), normalizeSqlTerm(country));
}

for (const aliases of COUNTRY_ALIAS_GROUPS) {
  const canonical = aliases[0];
  for (const alias of aliases) {
    COUNTRY_ALIAS_TO_CANONICAL.set(normalizeSqlTerm(alias), canonical);
  }
}

function normalizeVendorCountry(value) {
  const normalized = normalizeSqlTerm(value);
  if (!normalized) return null;
  return COUNTRY_ALIAS_TO_CANONICAL.get(normalized) || null;
}

function extractVendorCountryFromTokens(tokens) {
  const values = Array.isArray(tokens)
    ? tokens
        .map((token) => normalizeSqlTerm(token))
        .filter(Boolean)
    : [];
  if (!values.length) {
    return { canonical: null, text: null, matchedTokens: [], remainingTokens: [] };
  }

  for (let size = Math.min(3, values.length); size >= 1; size -= 1) {
    const suffixTokens = values.slice(-size);
    const suffixText = suffixTokens.join(' ');
    const suffixCanonical = normalizeVendorCountry(suffixText);
    if (suffixCanonical) {
      return {
        canonical: suffixCanonical,
        text: suffixText,
        matchedTokens: suffixTokens,
        remainingTokens: values.slice(0, -size),
      };
    }

    const prefixTokens = values.slice(0, size);
    const prefixText = prefixTokens.join(' ');
    const prefixCanonical = normalizeVendorCountry(prefixText);
    if (prefixCanonical) {
      return {
        canonical: prefixCanonical,
        text: prefixText,
        matchedTokens: prefixTokens,
        remainingTokens: values.slice(size),
      };
    }
  }

  return { canonical: null, text: null, matchedTokens: [], remainingTokens: values };
}

function vendorCountryMatches(parsedCountry, candidateCountry) {
  const normalizedParsed = normalizeVendorCountry(parsedCountry);
  const normalizedCandidate = normalizeVendorCountry(candidateCountry);
  return Boolean(normalizedParsed && normalizedCandidate && normalizedParsed === normalizedCandidate);
}

module.exports = {
  extractVendorCountryFromTokens,
  normalizeVendorCountry,
  vendorCountryMatches,
};
