function normalizeCapturedText(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized || null;
}

module.exports = {
  normalizeCapturedText,
};
