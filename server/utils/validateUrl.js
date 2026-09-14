// Shared link validation for every admin-editable URL field. Rejects
// anything that isn't a genuine https:// link — this is what stops a
// `javascript:` URL from being saved as a "quick link" or embed and then
// executed when a student clicks it (the pages that render these already
// escape the text itself, but escaping doesn't stop a link's own scheme
// from doing something dangerous when followed).

function isHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

function hostMatches(value, allowedHosts) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

// Validates a URL field that's allowed to be blank (most of these links are
// optional). Returns an error string, or null if the value is fine.
function validateOptionalUrl(value, { fieldName, allowedHosts } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (!isHttpsUrl(value)) return `${fieldName || 'Link'} must be a valid https:// link.`;
  if (allowedHosts && !hostMatches(value, allowedHosts)) {
    return `${fieldName || 'Link'} must be a ${allowedHosts.join(' or ')} link.`;
  }
  return null;
}

module.exports = { isHttpsUrl, hostMatches, validateOptionalUrl };
