// Reads a Canva embed from what an admin pasted: either the embed link itself
// (https://www.canva.com/design/.../view?embed) or the whole embed code Canva
// gives out. Only the frame's address is kept, never any of the pasted HTML.
const { validateOptionalUrl, normalizeUrl } = require('./validateUrl');

const CANVA_HOSTS = ['canva.com'];

function decodeEntities(text) {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/gi, '"');
}

// Returns { url } (always ending in ?embed) or { error }.
function extractCanvaEmbed(input) {
  let text = typeof input === 'string' ? input.trim() : '';
  if (!text) return { url: '' };

  // Pasted embed code: take the address from the <iframe src="...">.
  if (text.includes('<')) {
    const match = text.match(/<iframe\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/is);
    if (!match) return { error: 'That embed code has no frame address in it. Paste the embed link, or the whole embed code from Canva.' };
    text = decodeEntities(match[2]).trim();
  }

  const urlError = validateOptionalUrl(text, { fieldName: 'Embed link', allowedHosts: CANVA_HOSTS });
  if (urlError) return { error: urlError.replace('must be a canva.com link', 'must be a Canva (canva.com) link') };
  const url = new URL(normalizeUrl(text));
  if (!url.pathname.startsWith('/design/')) return { error: 'That is not a link to a Canva design.' };
  if (!url.searchParams.has('embed')) url.search = '?embed';
  return { url: url.toString() };
}

// The normal "open it" link for an embed address: the same design without ?embed.
function viewUrlFromEmbed(embedUrl) {
  try {
    const url = new URL(embedUrl);
    url.searchParams.delete('embed');
    return url.toString();
  } catch {
    return '';
  }
}

module.exports = { extractCanvaEmbed, viewUrlFromEmbed };