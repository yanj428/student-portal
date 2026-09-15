// Shared link validation for every admin-editable URL field. Rejects
// anything that isn't a genuine http(s):// link — this is what stops a
// `javascript:` URL from being saved as a "quick link" or embed and then
// executed when a student clicks it (the pages that render these already
// escape the text itself, but escaping doesn't stop a link's own scheme
// from doing something dangerous when followed). Defaults to https-only;
// pass allowHttp: true for the handful of fields (currently just Quick
// Links) where a plain http:// link is a real, legitimate case.

function isHttpsUrl(value, { allowHttp = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const protocol = new URL(value.trim()).protocol;
    return protocol === 'https:' || (allowHttp && protocol === 'http:');
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
function validateOptionalUrl(value, { fieldName, allowedHosts, allowHttp = false } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (!isHttpsUrl(value, { allowHttp })) {
    return `${fieldName || 'Link'} must be a valid ${allowHttp ? 'http:// or https://' : 'https://'} link.`;
  }
  if (allowedHosts && !hostMatches(value, allowedHosts)) {
    return `${fieldName || 'Link'} must be a ${allowedHosts.join(' or ')} link.`;
  }
  return null;
}

// Returns the URL re-serialized through the URL parser rather than the
// raw text as typed — this percent-encodes characters like `"` and `'`
// that have no business in a URL but would otherwise be stored verbatim
// and could break out of an href="..." attribute if a page ever rendered
// one without properly escaping quotes (defense in depth alongside fixing
// escapeHtml itself on the client). Only call after validateOptionalUrl
// has already confirmed the value is a valid, allowed URL.
function normalizeUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  return new URL(value.trim()).toString();
}

module.exports = { isHttpsUrl, hostMatches, validateOptionalUrl, normalizeUrl };
