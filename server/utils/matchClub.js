// Works out which club a typed name means, so a community service post can
// show that club's exact name and logo even when it was typed a bit differently
// ("betterworld thailand", "Pawservation").

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Returns the club, or null when nothing fits or more than one club could. A
// wrong guess would put the wrong logo on a post, so no match is better.
function findClub(clubs, text, preferredId) {
  if (preferredId) {
    const kept = clubs.find((c) => c.id === preferredId);
    if (kept) return kept;
  }
  const wanted = normalize(text);
  if (wanted.length < 3) return null;

  const exact = clubs.filter((c) => normalize(c.name) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  // One name inside the other: "Pawservation" for "Pawservation Club", or the
  // club's name inside a longer phrase.
  const partial = clubs.filter((c) => {
    const name = normalize(c.name);
    return name.length >= 3 && (name.includes(wanted) || wanted.includes(name));
  });
  return partial.length === 1 ? partial[0] : null;
}

module.exports = { findClub };