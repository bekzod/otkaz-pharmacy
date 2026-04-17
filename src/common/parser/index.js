const {
  normalizeMedicineFormPhrases,
  transliterateLatinToCyrillic,
} = require('../../utils/medicine-fuzzy-search');
const { extractVendorCountryFromTokens } = require('../vendor-country');
const {
  MEDICINE_FORM_NORMALIZERS,
  MEDICINE_FORM_PRIORITIES,
  parseDosageForm,
} = require('../../utils/medicine-dosage-forms');
const {
  MEDICINE_DESCRIPTOR_TOKENS,
  MEDICINE_FORM_TOKENS,
  MEDICINE_UNIT_TOKENS,
  normalizeMedicineToken,
} = require('../../utils/medicine-name-profile');
const { LATIN_TO_CYRILLIC, LATIN_HOMOGLYPH_RE } = require('../latin-to-cyrillic');
const TOKEN_RE =
  /\d+(?:\.\d+)?(?:x\d+|[a-zа-яё]+)?|[a-zа-яё][a-zа-яё0-9]*(?:-[a-zа-яё0-9]+)*|%|\/|\+/giu;

// Russian descriptor / indication words that commonly trail pharmacy listings
// and shouldn't pollute the trade-name signal. Keep tight to avoid dropping
// legitimate active-ingredient tokens.
const PARSER_NOISE_TOKENS = new Set([
  'антигистаминное',
  'антигистаминный',
  'антигистаминная',
  'антигистаминные',
  'средство',
  'средства',
  'средств',
  'препарат',
  'препарата',
  'препараты',
  'лекарство',
  'лекарства',
  'леч',
  'муж',
  'жен',
  'эрекции',
  'эрекция',
  'бесплодия',
  'бесплодие',
  'потенции',
  'потенция',
  'дет',
  'детей',
  'детск',
  'взр',
  'взрослых',
  'взрослый',
  'дозир',
  'местн',
  'наружн',
  'шип',
  'шипуч',
]);

const UNIT_FAMILY_BY_VALUE = new Map([
  ['%', 'percent'],
  ['ед', 'dose'],
  ['ме', 'dose'],
  ['доз', 'dose'],
  ['мг', 'mass'],
  ['мкг', 'mass'],
  ['г', 'mass'],
  ['кг', 'mass'],
  ['мл', 'volume'],
  ['л', 'volume'],
  ['мм', 'length'],
  ['см', 'length'],
  ['м', 'length'],
  ['ч', 'time'],
  ['сут', 'time'],
]);

const CONTAINER_NORMALIZERS = [
  {
    pattern: /^(флак\.?|флакон(?:ы|а|е|ов|ам|ами|ах)?|флакон-капельниц[а-я-]*)$/u,
    containerType: 'vial',
    dosageForm: 'solution',
  },
  {
    pattern: /^(амп|амп\.|ампул(?:ы|а|е|ов|ам|ами|ах)?)$/u,
    containerType: 'ampoule',
    dosageForm: 'injection',
  },
  {
    pattern: /^(карт(?:\.|ридж(?:и|а|ей|ам|ами|ах)?)?)$/u,
    containerType: 'cartridge',
    dosageForm: 'injection',
  },
  {
    pattern: /^(блистер(?:ы|а|е|ов|ам|ами|ах)?)$/u,
    containerType: 'blister',
  },
  {
    pattern: /^(туб(?:а|ы|е|у|ой|ами|ах)?|туб\.?)$/u,
    containerType: 'tube',
  },
  {
    pattern: /^(бутылк(?:а|и|е|у|ой|ами|ах)?)$/u,
    containerType: 'bottle',
  },
  {
    pattern: /^(пакетик[а-я]*|пакет\.?|пакеты|паке\.|саше|стик[а-я]*)$/u,
    containerType: 'sachet',
  },
];

const PRODUCT_TYPE_PATTERNS = {
  other: [
    /презерватив[а-я]*/iu,
    /тест.?полос/iu,
    /test.?strip/iu,
    /гель-?смазк[а-я]*/iu,
    /смазк[а-я]*/iu,
    /\broll\s*on\b/iu,
    /\bролл?\s*он\b/iu,
    /\bdeo\b/iu,
    /подгузник[а-яё]*/iu,
    /трусик[а-яё]*/iu,
    /тампон[а-яё]*/iu,
    /марл[аеёиою][а-яё]*/iu,
    /пробирк[а-яё]*/iu,
    /предметное.стекло/iu,
    /покровное.стекло/iu,
  ],
  devicePrimary: [
    /игл[а-я]*/iu,
    /шприц(?!-?\s*руч)(?:[а-я]*)?/iu,
    /система/iu,
    /катетер(?:[а-я]*)?/iu,
    /термометр(?:[а-я]*)?/iu,
    /тонометр(?:[а-я]*)?/iu,
    /небулайзер(?:[а-я]*)?/iu,
    /бандаж(?:[а-я]*)?/iu,
    /костыл[а-яё]*/iu,
  ],
  deviceAccessory: [/аппликатор\s+для\s+кожи/iu],
};

function normalizeLatinHomoglyphs(text) {
  return String(text || '').replace(/\S+/g, (word) => {
    if (/[\u0400-\u04ff]/u.test(word) && /[a-zA-Z]/u.test(word)) {
      return word.replace(LATIN_HOMOGLYPH_RE, (char) => LATIN_TO_CYRILLIC[char] || char);
    }
    return word;
  });
}

function normalizeSqlTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

function normalizeFormTokenValue(token) {
  const cleaned = normalizeSqlTerm(token).replace(/[.,]+$/gu, '');
  if (!cleaned) return '';

  for (const [pattern, normalized] of MEDICINE_FORM_NORMALIZERS) {
    if (pattern.test(cleaned)) return normalized;
  }

  return cleaned;
}

function normalizeAttachedUnit(unitToken) {
  const normalized = normalizeMedicineToken(unitToken);
  return MEDICINE_UNIT_TOKENS.has(normalized) ? normalized : '';
}

function parseContainerType(token) {
  const cleaned = normalizeSqlTerm(token).replace(/[.,]+$/gu, '');

  for (const entry of CONTAINER_NORMALIZERS) {
    if (entry.pattern.test(cleaned)) return entry;
  }

  return null;
}

function normalizeRawSegment(segment) {
  const value = normalizeSqlTerm(segment).replace(/[.,]+$/gu, '');
  if (!value) return '';

  if (value.includes('+')) {
    const normalizedParts = value
      .split('+')
      .map((part) => normalizeRawSegment(part))
      .filter(Boolean);

    if (normalizedParts.length) return normalizedParts.join(' + ');
  }

  const packMatch = value.match(/^n(\d+)$/u);
  if (packMatch) return `n ${packMatch[1]}`;

  const percentMatch = value.match(/^(\d+(?:\.\d+)?)(%|проц)$/u);
  if (percentMatch) return `${percentMatch[1]}%`;

  const multiDosageRatioWithDenominatorValueMatch = value.match(
    /^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)+)([a-zа-яё]+)\/(\d+(?:\.\d+)?)([a-zа-яё]+)$/u,
  );
  if (multiDosageRatioWithDenominatorValueMatch) {
    const numeratorUnit = normalizeAttachedUnit(multiDosageRatioWithDenominatorValueMatch[2]);
    const denominatorUnit = normalizeAttachedUnit(multiDosageRatioWithDenominatorValueMatch[4]);
    if (numeratorUnit && denominatorUnit) {
      return `${multiDosageRatioWithDenominatorValueMatch[1]} ${numeratorUnit}/${multiDosageRatioWithDenominatorValueMatch[3]} ${denominatorUnit}`;
    }
  }

  const multiDosageRatioMatch = value.match(
    /^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)+)([a-zа-яё]+)\/([a-zа-яё]+)$/u,
  );
  if (multiDosageRatioMatch) {
    const numeratorUnit = normalizeAttachedUnit(multiDosageRatioMatch[2]);
    const denominatorUnit = normalizeAttachedUnit(multiDosageRatioMatch[3]);
    if (numeratorUnit && denominatorUnit) {
      return `${multiDosageRatioMatch[1]} ${numeratorUnit}/${denominatorUnit}`;
    }
  }

  const dosageRatioWithDenominatorValueMatch = value.match(
    /^(\d+(?:\.\d+)?)([a-zа-яё]+)\/(\d+(?:\.\d+)?)([a-zа-яё]+)$/u,
  );
  if (dosageRatioWithDenominatorValueMatch) {
    const numeratorUnit = normalizeAttachedUnit(dosageRatioWithDenominatorValueMatch[2]);
    const denominatorUnit = normalizeAttachedUnit(dosageRatioWithDenominatorValueMatch[4]);
    if (numeratorUnit && denominatorUnit) {
      return `${dosageRatioWithDenominatorValueMatch[1]} ${numeratorUnit}/${dosageRatioWithDenominatorValueMatch[3]} ${denominatorUnit}`;
    }
  }

  const dosageRatioMatch = value.match(/^(\d+(?:\.\d+)?)([a-zа-яё]+)\/([a-zа-яё]+)$/u);
  if (dosageRatioMatch) {
    const numeratorUnit = normalizeAttachedUnit(dosageRatioMatch[2]);
    const denominatorUnit = normalizeAttachedUnit(dosageRatioMatch[3]);
    if (numeratorUnit && denominatorUnit) {
      return `${dosageRatioMatch[1]} ${numeratorUnit}/${denominatorUnit}`;
    }
  }

  const attachedUnitMatch = value.match(/^(\d+(?:\.\d+)?)([a-zа-яё]+)$/u);
  if (attachedUnitMatch) {
    const normalizedUnit = normalizeAttachedUnit(attachedUnitMatch[2]);
    if (normalizedUnit) return `${attachedUnitMatch[1]} ${normalizedUnit}`;
  }

  const normalizedUnit = normalizeAttachedUnit(value);
  if (normalizedUnit) return normalizedUnit;

  return value;
}

function normalizeMedicineQuery(rawQuery) {
  const prepared = normalizeLatinHomoglyphs(normalizeMedicineFormPhrases(rawQuery))
    .replace(/(\d),(\d)/gu, '$1.$2')
    .replace(/(\d)\s*[х×x]\s*(\d)/gu, '$1x$2')
    .replace(/(\d+)(мм|см|м)\s*[хx×]\s*(\d+)/gu, '$1 $2 х $3')
    .replace(/\bsoft\s*gels?\b/giu, 'softgel')
    .replace(/\bveg\s*caps(?:ule)?s?\b/giu, 'vegcaps')
    .replace(/\b(\d{1,3}(?:\s+\d{3})+)\b/gu, (value) => value.replace(/\s+/gu, ''))
    .replace(/№\s*(\d+)/gu, '')
    .replace(/№/gu, '')
    .replace(/\\/gu, '/')
    .replace(/[,:;!?()[\]{}"'`«»]+/gu, ' ')
    .replace(/(?<!\d)\.(?!\d)/gu, ' ')
    .replace(/(?<=\p{L})\.(?=\d)/gu, ' ')
    .replace(/(?<=[\u0400-\u04ff])(?=\d)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!prepared) return '';

  return prepared
    .split(' ')
    .map(normalizeRawSegment)
    .filter(Boolean)
    .join(' ')
    .replace(/\s*\+\s*/gu, ' + ')
    .replace(/(\d+(?:\.\d+)?)\s+%/gu, '$1%')
    .replace(/(\d+(?:\.\d+)?)\s+([\p{L}%]+)\s+\/\s+(\d+(?:\.\d+)?)\s+([\p{L}%]+)/gu, '$1 $2/$3 $4')
    .replace(/(\d+(?:\.\d+)?)\s+([\p{L}%]+)\s+\/\s+([\p{L}%]+)/gu, '$1 $2/$3')
    .replace(/\s+/gu, ' ')
    .trim();
}

function classifyWordToken(token) {
  if (token === 'n') {
    return { type: 'COUNT_MARKER', normalizedValue: token };
  }

  if (/^\d+x\d+$/u.test(token)) {
    const [left, right] = token.split('x').map((value) => Number.parseInt(value, 10));
    return {
      type: 'COUNT_MULTIPLIER',
      normalizedValue: token,
      left,
      right,
      count: Number.isFinite(left) && Number.isFinite(right) ? left * right : null,
    };
  }

  const container = parseContainerType(token);
  const dosageForm = parseDosageForm(token);
  if (dosageForm) {
    const normalizedValue = normalizeFormTokenValue(token);
    return {
      type: 'DOSAGE_FORM',
      normalizedValue,
      dosageForm,
      dosageFormSource:
        container?.dosageForm === dosageForm ? 'inferred_from_container' : 'explicit',
      containerType: container?.containerType || null,
      priority: MEDICINE_FORM_PRIORITIES.get(normalizedValue) || 0,
    };
  }

  if (container) {
    return {
      type: 'CONTAINER',
      normalizedValue: container.containerType,
      containerType: container.containerType,
    };
  }

  const normalizedToken = normalizeMedicineToken(token);
  if (MEDICINE_UNIT_TOKENS.has(normalizedToken)) {
    return {
      type: 'UNIT',
      normalizedValue: normalizedToken,
      unitFamily: UNIT_FAMILY_BY_VALUE.get(normalizedToken) || 'other',
    };
  }

  if (!normalizedToken) {
    return {
      type: 'WORD',
      normalizedValue: '',
    };
  }

  return {
    type: 'WORD',
    normalizedValue: normalizedToken,
  };
}

function tokenizeMedicineQuery(rawQuery) {
  const normalizedText = normalizeMedicineQuery(rawQuery);
  if (!normalizedText) return [];

  return [...normalizedText.matchAll(TOKEN_RE)].map((match) => {
    const value = match[0];
    const start = match.index || 0;
    const end = start + value.length;

    if (value === '%') {
      return { type: 'PERCENT', value, normalizedValue: value, start, end };
    }

    if (value === '/') {
      return { type: 'SLASH', value, normalizedValue: value, start, end };
    }

    if (value === '+') {
      return { type: 'PLUS', value, normalizedValue: value, start, end };
    }

    if (/^\d+(?:\.\d+)?$/u.test(value)) {
      return {
        type: 'NUMBER',
        value,
        normalizedValue: value,
        numericValue: Number.parseFloat(value),
        start,
        end,
      };
    }

    return {
      value,
      start,
      end,
      ...classifyWordToken(value),
    };
  });
}

function buildMeasurementNode(numberToken, unitToken, startIndex, endIndex) {
  return {
    text: `${numberToken.value} ${unitToken.normalizedValue}`,
    value: Number.parseFloat(numberToken.value),
    unit: unitToken.normalizedValue,
    startIndex,
    endIndex,
  };
}

function buildSimpleStrengthNode(values, unit, startIndex, endIndex) {
  const text = unit === '%' ? `${values.join('/')}%` : `${values.join('/')} ${unit}`;
  return {
    kind: 'simple',
    text,
    values,
    value: values.length === 1 ? values[0] : null,
    unit,
    startIndex,
    endIndex,
  };
}

function buildCombinationStrengthNode(components, startIndex, endIndex) {
  return {
    kind: 'combination',
    text: components.map((component) => component.text).join(' + '),
    components: components.map((component) => ({
      value: component.value,
      unit: component.unit,
    })),
    startIndex,
    endIndex,
  };
}

function buildRatioStrengthNode(values, unit, denominator, startIndex, endIndex) {
  const denominatorText =
    denominator.value == null ? denominator.unit : `${denominator.value} ${denominator.unit}`;

  return {
    kind: 'ratio',
    text: `${values.join('/')} ${unit}/${denominatorText}`,
    values,
    value: values.length === 1 ? values[0] : null,
    unit,
    denominator,
    startIndex,
    endIndex,
  };
}

function collectNumericSequence(tokens, startIndex) {
  if (tokens[startIndex]?.type !== 'NUMBER') return null;

  const values = [Number.parseFloat(tokens[startIndex].value)];
  let nextIndex = startIndex + 1;

  while (tokens[nextIndex]?.type === 'SLASH' && tokens[nextIndex + 1]?.type === 'NUMBER') {
    values.push(Number.parseFloat(tokens[nextIndex + 1].value));
    nextIndex += 2;
  }

  return { values, nextIndex };
}

function buildPercentStrengthNode(tokens, startIndex) {
  const sequence = collectNumericSequence(tokens, startIndex);
  if (!sequence || tokens[sequence.nextIndex]?.type !== 'PERCENT') return null;

  return buildSimpleStrengthNode(sequence.values, '%', startIndex, sequence.nextIndex);
}

function buildMultiComponentRatioStrength(tokens, startIndex) {
  if (tokens[startIndex]?.type !== 'NUMBER') return null;

  const components = [];
  let cursor = startIndex;

  const firstNum = tokens[cursor];
  const firstUnit = tokens[cursor + 1];
  if (firstUnit?.type !== 'UNIT') return null;

  components.push(firstNum);
  const sharedUnit = firstUnit.normalizedValue;
  cursor += 2;

  while (
    tokens[cursor]?.type === 'SLASH' &&
    tokens[cursor + 1]?.type === 'NUMBER' &&
    tokens[cursor + 2]?.type === 'UNIT' &&
    tokens[cursor + 2].normalizedValue === sharedUnit
  ) {
    components.push(tokens[cursor + 1]);
    cursor += 3;
  }

  if (components.length < 2 || tokens[cursor]?.type !== 'SLASH') return null;

  if (
    tokens[cursor + 1]?.type === 'NUMBER' &&
    tokens[cursor + 2]?.type === 'UNIT' &&
    tokens[cursor + 2].normalizedValue !== sharedUnit
  ) {
    return buildRatioStrengthNode(
      components.map((c) => Number.parseFloat(c.value)),
      sharedUnit,
      {
        value: Number.parseFloat(tokens[cursor + 1].value),
        unit: tokens[cursor + 2].normalizedValue,
      },
      startIndex,
      cursor + 2,
    );
  }

  if (tokens[cursor + 1]?.type === 'UNIT' && tokens[cursor + 1].normalizedValue !== sharedUnit) {
    return buildRatioStrengthNode(
      components.map((c) => Number.parseFloat(c.value)),
      sharedUnit,
      {
        value: null,
        unit: tokens[cursor + 1].normalizedValue,
      },
      startIndex,
      cursor + 1,
    );
  }

  return null;
}

function buildStrengthNode(tokens, startIndex) {
  const sequence = collectNumericSequence(tokens, startIndex);
  if (!sequence) return null;

  const numeratorUnitToken = tokens[sequence.nextIndex];
  if (numeratorUnitToken?.type !== 'UNIT') return null;

  if (tokens[sequence.nextIndex + 1]?.type === 'SLASH') {
    const denominatorNumberToken = tokens[sequence.nextIndex + 2];
    const denominatorUnitToken = tokens[sequence.nextIndex + 3];

    if (
      denominatorNumberToken?.type === 'NUMBER' &&
      denominatorUnitToken?.type === 'UNIT' &&
      denominatorUnitToken.normalizedValue !== numeratorUnitToken.normalizedValue
    ) {
      return buildRatioStrengthNode(
        sequence.values,
        numeratorUnitToken.normalizedValue,
        {
          value: Number.parseFloat(denominatorNumberToken.value),
          unit: denominatorUnitToken.normalizedValue,
        },
        startIndex,
        sequence.nextIndex + 3,
      );
    }

    if (denominatorNumberToken?.type === 'UNIT') {
      return buildRatioStrengthNode(
        sequence.values,
        numeratorUnitToken.normalizedValue,
        {
          value: null,
          unit: denominatorNumberToken.normalizedValue,
        },
        startIndex,
        sequence.nextIndex + 2,
      );
    }
  }

  return buildSimpleStrengthNode(
    sequence.values,
    numeratorUnitToken.normalizedValue,
    startIndex,
    sequence.nextIndex,
  );
}

function buildSingleStrengthComponent(tokens, startIndex) {
  const percentStrength = buildPercentStrengthNode(tokens, startIndex);
  if (percentStrength) return percentStrength;

  const strengthNode = buildStrengthNode(tokens, startIndex);
  if (!strengthNode || strengthNode.kind !== 'simple' || strengthNode.value == null) return null;
  if (UNIT_FAMILY_BY_VALUE.get(strengthNode.unit) === 'volume') return null;
  return strengthNode;
}

function buildCombinationStrengthCandidate(tokens, startIndex) {
  const firstComponent = buildSingleStrengthComponent(tokens, startIndex);
  if (!firstComponent) return null;

  const components = [firstComponent];
  let cursor = firstComponent.endIndex + 1;

  while (tokens[cursor]?.type === 'PLUS') {
    const nextComponent = buildSingleStrengthComponent(tokens, cursor + 1);
    if (!nextComponent) break;
    components.push(nextComponent);
    cursor = nextComponent.endIndex + 1;
  }

  if (components.length < 2) return null;
  return buildCombinationStrengthNode(components, startIndex, components.at(-1).endIndex);
}

function shouldKeepNumberAsBrandToken(tokens, index, consumedIndexes) {
  if (consumedIndexes.has(index)) return false;

  const previous = tokens[index - 1];
  const next = tokens[index + 1];

  return Boolean(
    (previous?.type === 'WORD' && !consumedIndexes.has(index - 1)) ||
    (next?.type === 'WORD' && !consumedIndexes.has(index + 1)),
  );
}

function toPublicStrengthNode(strength) {
  if (!strength) return null;

  if (strength.kind === 'combination') {
    return {
      kind: strength.kind,
      text: strength.text,
      components: strength.components,
    };
  }

  return {
    kind: strength.kind,
    text: strength.text,
    values: strength.values,
    value: strength.value,
    unit: strength.unit,
    ...(strength.denominator ? { denominator: strength.denominator } : {}),
  };
}

function toPublicMeasurementNode(measurement) {
  if (!measurement) return null;

  const node = {
    text: measurement.text,
    value: measurement.value,
    unit: measurement.unit,
  };

  if (measurement.dimension2) {
    node.dimension2 = measurement.dimension2;
  }

  return node;
}

function dedupePublicNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    const key = JSON.stringify(node);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyProductType(rawQuery, normalizedText, { dosageForm, strengths, volumes } = {}) {
  const text = `${rawQuery || ''} ${normalizedText || ''}`.trim();

  for (const pattern of PRODUCT_TYPE_PATTERNS.other) {
    if (pattern.test(text)) return 'other';
  }

  for (const pattern of PRODUCT_TYPE_PATTERNS.devicePrimary) {
    if (pattern.test(text)) return 'device';
  }

  if (dosageForm) return 'medicine';

  for (const pattern of PRODUCT_TYPE_PATTERNS.deviceAccessory) {
    if (pattern.test(text)) return 'device';
  }

  const PHARMA_STRENGTH_UNITS = new Set(['мг', 'мкг', '%', 'ед', 'ме']);
  const hasPharmaStrength = (strengths || []).some(
    (s) =>
      (s.kind === 'simple' && PHARMA_STRENGTH_UNITS.has(s.unit)) ||
      s.kind === 'ratio' ||
      s.kind === 'combination',
  );
  const hasLiquidVolume = (volumes || []).some((v) => v.unit === 'мл' || v.unit === 'л');

  if (hasPharmaStrength || hasLiquidVolume) {
    return 'medicine';
  }

  return null;
}

function isBrandOnlyProductType(productType) {
  return productType === 'device' || productType === 'other';
}

function parseMedicineQuery(rawQuery) {
  const normalizedText = normalizeMedicineQuery(rawQuery);
  const tokens = tokenizeMedicineQuery(rawQuery);
  const consumedIndexes = new Set();
  const tokenRoles = new Map();
  const strengthCandidates = [];
  const volumeCandidates = [];
  let dosageForm = null;
  let dosageFormToken = null;
  let dosageFormSource = null;
  let containerType = null;
  let packCount = null;

  // Extract pack count from №N patterns directly from raw query (last one wins)
  for (const match of (rawQuery || '').matchAll(/№\s*(\d+)/gu)) {
    packCount = Number.parseInt(match[1], 10);
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'COUNT_MULTIPLIER') {
      const nextToken = tokens[index + 1];
      if (nextToken?.type === 'UNIT') {
        volumeCandidates.push(
          buildMeasurementNode(
            { value: token.normalizedValue, normalizedValue: null },
            { normalizedValue: nextToken.normalizedValue },
            index,
            index + 1,
          ),
        );
        consumedIndexes.add(index);
        consumedIndexes.add(index + 1);
        tokenRoles.set(index, 'volume');
        tokenRoles.set(index + 1, 'volume');
        index += 1;
        continue;
      }
      if (packCount == null && Number.isFinite(token.count) && token.count > 0) {
        packCount = token.count;
      }
      consumedIndexes.add(index);
      tokenRoles.set(index, 'pack');
      continue;
    }

    if (token.type === 'DOSAGE_FORM') {
      const sourcePriority = token.dosageFormSource === 'explicit' ? 2 : 1;
      const currentSourcePriority =
        dosageFormSource === 'explicit'
          ? 2
          : dosageFormSource === 'inferred_from_container'
            ? 1
            : 0;

      if (
        !dosageFormToken ||
        sourcePriority > currentSourcePriority ||
        (sourcePriority === currentSourcePriority && token.priority >= dosageFormToken.priority)
      ) {
        dosageForm = token.dosageForm;
        dosageFormToken = token;
        dosageFormSource = token.dosageFormSource;
      }

      if (!containerType && token.containerType) {
        containerType = token.containerType;
      }

      consumedIndexes.add(index);
      tokenRoles.set(index, 'dosage_form');
      continue;
    }

    if (token.type === 'CONTAINER') {
      if (!containerType) containerType = token.containerType;
      consumedIndexes.add(index);
      tokenRoles.set(index, 'container');
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (consumedIndexes.has(index)) continue;

    const token = tokens[index];

    if (token.type !== 'NUMBER') continue;

    // Dimension notation: NUMBER UNIT(length) х NUMBER UNIT(length)
    if (
      tokens[index + 1]?.type === 'UNIT' &&
      UNIT_FAMILY_BY_VALUE.get(tokens[index + 1].normalizedValue) === 'length' &&
      tokens[index + 2]?.type === 'WORD' &&
      (tokens[index + 2].normalizedValue === 'х' || tokens[index + 2].normalizedValue === 'x') &&
      tokens[index + 3]?.type === 'NUMBER' &&
      tokens[index + 4]?.type === 'UNIT' &&
      UNIT_FAMILY_BY_VALUE.get(tokens[index + 4].normalizedValue) === 'length'
    ) {
      const dimensionText = `${token.value} ${tokens[index + 1].normalizedValue} х ${tokens[index + 3].value} ${tokens[index + 4].normalizedValue}`;
      volumeCandidates.push({
        text: dimensionText,
        value: Number.parseFloat(token.value),
        unit: tokens[index + 1].normalizedValue,
        dimension2: {
          value: Number.parseFloat(tokens[index + 3].value),
          unit: tokens[index + 4].normalizedValue,
        },
        startIndex: index,
        endIndex: index + 4,
      });
      for (let ci = index; ci <= index + 4; ci += 1) {
        consumedIndexes.add(ci);
        tokenRoles.set(ci, 'volume');
      }
      index = index + 4;
      continue;
    }

    const combinationStrength = buildCombinationStrengthCandidate(tokens, index);
    if (combinationStrength) {
      strengthCandidates.push(combinationStrength);
      for (
        let consumedIndex = combinationStrength.startIndex;
        consumedIndex <= combinationStrength.endIndex;
        consumedIndex += 1
      ) {
        consumedIndexes.add(consumedIndex);
        tokenRoles.set(consumedIndex, 'strength');
      }
      index = combinationStrength.endIndex;
      continue;
    }

    const percentStrength = buildPercentStrengthNode(tokens, index);
    if (percentStrength) {
      strengthCandidates.push(percentStrength);
      for (
        let consumedIndex = percentStrength.startIndex;
        consumedIndex <= percentStrength.endIndex;
        consumedIndex += 1
      ) {
        consumedIndexes.add(consumedIndex);
        tokenRoles.set(consumedIndex, 'strength');
      }
      index = percentStrength.endIndex;
      continue;
    }

    const multiComponentRatio = buildMultiComponentRatioStrength(tokens, index);
    if (multiComponentRatio) {
      strengthCandidates.push(multiComponentRatio);
      for (
        let consumedIndex = multiComponentRatio.startIndex;
        consumedIndex <= multiComponentRatio.endIndex;
        consumedIndex += 1
      ) {
        consumedIndexes.add(consumedIndex);
        tokenRoles.set(consumedIndex, 'strength');
      }
      index = multiComponentRatio.endIndex;
      continue;
    }

    if (
      tokens[index + 1]?.type === 'DOSAGE_FORM' &&
      Number.isFinite(token.numericValue) &&
      Number.isInteger(token.numericValue) &&
      token.numericValue > 0
    ) {
      packCount = token.numericValue;
      consumedIndexes.add(index);
      tokenRoles.set(index, 'pack');
      continue;
    }

    const strengthNode = buildStrengthNode(tokens, index);

    if (!strengthNode) continue;

    const unitFamily = UNIT_FAMILY_BY_VALUE.get(strengthNode.unit);
    const isDoseCount = strengthNode.kind === 'simple' && strengthNode.unit === 'доз';
    const isVolumeNode = strengthNode.kind === 'simple' && (unitFamily === 'volume' || unitFamily === 'length' || isDoseCount);
    if (isVolumeNode) {
      volumeCandidates.push(
        buildMeasurementNode(
          { value: String(strengthNode.value), normalizedValue: null },
          { normalizedValue: strengthNode.unit },
          strengthNode.startIndex,
          strengthNode.endIndex,
        ),
      );
    } else {
      strengthCandidates.push(strengthNode);
    }

    for (
      let consumedIndex = strengthNode.startIndex;
      consumedIndex <= strengthNode.endIndex;
      consumedIndex += 1
    ) {
      consumedIndexes.add(consumedIndex);
      tokenRoles.set(consumedIndex, isVolumeNode ? 'volume' : 'strength');
    }
    index = strengthNode.endIndex;
  }

  const PRECISE_STRENGTH_UNITS = new Set(['мг', 'мкг', '%']);
  const TOPICAL_PACKAGE_FORMS = new Set(['cream', 'ointment', 'gel', 'paste']);
  const hasPreciserStrength = strengthCandidates.some(
    (s) =>
      (s.kind === 'ratio' && UNIT_FAMILY_BY_VALUE.get(s.denominator?.unit) === 'volume') ||
      (s.kind === 'ratio' && UNIT_FAMILY_BY_VALUE.get(s.denominator?.unit) === 'dose') ||
      (s.kind === 'simple' && PRECISE_STRENGTH_UNITS.has(s.unit)) ||
      (s.kind === 'combination' && s.components?.some((c) => PRECISE_STRENGTH_UNITS.has(c.unit))),
  );
  const isTopicalForm = TOPICAL_PACKAGE_FORMS.has(dosageForm);
  if (hasPreciserStrength || isTopicalForm) {
    for (let i = strengthCandidates.length - 1; i >= 0; i -= 1) {
      const s = strengthCandidates[i];
      if (s.kind === 'simple' && (s.unit === 'г' || s.unit === 'л')) {
        volumeCandidates.push(
          buildMeasurementNode(
            { value: String(s.value), normalizedValue: null },
            { normalizedValue: s.unit },
            s.startIndex,
            s.endIndex,
          ),
        );
        for (let ci = s.startIndex; ci <= s.endIndex; ci += 1) {
          tokenRoles.set(ci, 'volume');
        }
        strengthCandidates.splice(i, 1);
      }
    }
  }

  const tradeNameEntries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (consumedIndexes.has(index)) continue;

    const token = tokens[index];
    if (token.type === 'WORD') {
      const normalizedToken = token.normalizedValue || '';
      if (
        normalizedToken &&
        !MEDICINE_DESCRIPTOR_TOKENS.has(normalizedToken) &&
        !MEDICINE_FORM_TOKENS.has(normalizedToken) &&
        !MEDICINE_UNIT_TOKENS.has(normalizedToken) &&
        !PARSER_NOISE_TOKENS.has(normalizedToken)
      ) {
        tradeNameEntries.push({ index, value: normalizedToken, isTradeName: true });
      } else if (!normalizedToken && token.value.length === 1) {
        tradeNameEntries.push({ index, value: token.value, isTradeName: false });
      }
      continue;
    }

    if (token.type === 'CONTAINER' || token.type === 'DOSAGE_FORM') continue;

    if (token.type === 'NUMBER' && shouldKeepNumberAsBrandToken(tokens, index, consumedIndexes)) {
      tradeNameEntries.push({ index, value: token.value, isTradeName: true });
    }
  }

  const tradeNameIndexes = new Set(
    tradeNameEntries.filter((entry) => entry.isTradeName).map((entry) => entry.index),
  );
  const residueTokens = [];
  for (const entry of tradeNameEntries) {
    if (entry.isTradeName) {
      residueTokens.push(entry.value);
      tokenRoles.set(entry.index, 'trade_name');
    } else if (tradeNameIndexes.has(entry.index - 1) || tradeNameIndexes.has(entry.index + 1)) {
      residueTokens.push(entry.value);
      tokenRoles.set(entry.index, 'trade_name');
    }
  }

  const uniqueResidueTokens = [...new Set(residueTokens)];
  const {
    canonical: vendorCountry,
    matchedTokens: vendorCountryTokens,
    remainingTokens: tradeNameResidueTokens,
  } = extractVendorCountryFromTokens(uniqueResidueTokens);
  const cyrillicTokenSet = new Set(
    tradeNameResidueTokens.filter((t) => /[\u0400-\u04ff]/u.test(t)),
  );
  const tradeNameTokens = tradeNameResidueTokens.filter((token) => {
    if (/[\u0400-\u04ff]/u.test(token)) return true;
    const transliterated = transliterateLatinToCyrillic(token);
    return !cyrillicTokenSet.has(transliterated);
  });
  const strengths = dedupePublicNodes(strengthCandidates.map(toPublicStrengthNode).filter(Boolean));
  const volumes = dedupePublicNodes(volumeCandidates.map(toPublicMeasurementNode).filter(Boolean));
  const productType = classifyProductType(rawQuery, normalizedText, {
    dosageForm,
    strengths,
    volumes,
  });
  const tradeNameText = tradeNameTokens.join(' ').trim() || null;

  const annotatedTokens = tokens.map((token, index) => ({
    ...token,
    role: tokenRoles.get(index) || null,
  }));

  if (isBrandOnlyProductType(productType)) {
    // Strip pack-count multipliers (e.g. "3x10", "1x1") from the full trade name text
    let fullTradeName = normalizedText || null;
    if (fullTradeName) {
      for (const [idx, role] of tokenRoles) {
        if (role === 'pack' && tokens[idx]?.type === 'COUNT_MULTIPLIER') {
          const v = tokens[idx].normalizedValue || tokens[idx].value;
          if (v) fullTradeName = fullTradeName.replace(v, '').replace(/\s+/gu, ' ').trim();
        }
      }
    }
    return {
      rawQuery: rawQuery || '',
      normalizedText,
      tokens: annotatedTokens,
      residueTokens: tradeNameTokens,
      attributes: {
        trade_name_text: fullTradeName,
        trade_name_tokens: tradeNameTokens,
        dosage_form: null,
        dosage_form_token: null,
        dosage_form_source: null,
        container_type: null,
        product_type: productType,
        vendor_country_text: vendorCountry,
        vendor_country_tokens: vendorCountryTokens,
        strengths: [],
        volumes: [],
        pack_count: packCount,
      },
    };
  }

  return {
    rawQuery: rawQuery || '',
    normalizedText,
    tokens: annotatedTokens,
    residueTokens: tradeNameTokens,
    attributes: {
      trade_name_text: tradeNameText,
      trade_name_tokens: tradeNameTokens,
      dosage_form: dosageForm || null,
      dosage_form_token: dosageFormToken?.normalizedValue || null,
      dosage_form_source: dosageFormSource,
      container_type: containerType,
      product_type: productType,
      vendor_country_text: vendorCountry,
      vendor_country_tokens: vendorCountryTokens,
      strengths,
      volumes,
      pack_count: packCount,
    },
  };
}

module.exports = {
  normalizeMedicineQuery,
  parseMedicineQuery,
  tokenizeMedicineQuery,
};
