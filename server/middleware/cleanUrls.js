// Pages live at clean URLs (/clubs, /login, /admin, ...). Old links with a
// trailing ".html" (bookmarks, links already shared) and trailing slashes are
// permanently redirected to the clean form, keeping any query string; a
// "#section" fragment is kept by the browser itself.
function cleanUrls(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let clean = null;
  if (req.path === '/index.html') clean = '/';
  else if (req.path.endsWith('.html')) clean = req.path.slice(0, -'.html'.length);
  else if (req.path.length > 1 && req.path.endsWith('/')) clean = req.path;
  if (clean === null) return next();

  // Collapsing the leading slashes matters: "//host/x.html" would otherwise
  // become the protocol-relative "//host/x", an open redirect to another site.
  // A raw backslash is treated as a slash by browsers, so it is refused too.
  if (clean.includes('\\')) return next();
  clean = `/${clean.replace(/^\/+/, '').replace(/\/+$/, '')}`;

  const queryStart = req.originalUrl.indexOf('?');
  const search = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  return res.redirect(301, clean + search);
}

module.exports = { cleanUrls };
