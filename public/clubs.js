const INSTAGRAM_ICON = '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/></svg>';

// Mission, goals, leaders, advisor and contacts are shown the same way for
// both club types - only the sections a club actually has are rendered.
function clubDetailsHtml(club) {
  const section = (label, text) =>
    text ? `<div class="club-info-section"><h4>${label}</h4><p>${escapeHtml(text)}</p></div>` : '';

  const contactLinks = club.instagramUrl
    ? `<a class="cs-club-link" href="${escapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">${INSTAGRAM_ICON}<span>Instagram</span></a>`
    : '';
  const contactsBlock =
    contactLinks || club.contacts
      ? `<div class="club-info-section"><h4>Contacts</h4>${club.contacts ? `<p>${escapeHtml(club.contacts)}</p>` : ''}${contactLinks}</div>`
      : '';

  return [
    section('Mission', club.mission),
    section('Goals', club.goals),
    section('Leader(s)', club.leaders),
    section('Teacher advisor', club.advisor),
    contactsBlock,
  ].join('');
}

// Logo (when the club has one) beside the name, and the UN SDG badges in the
// top-right corner, the same for both club types. The server only lists goals
// that have a badge image.
function clubHeadHtml(club) {
  const badges = club.sdgBadges.length
    ? `<div class="club-sdgs">${club.sdgBadges
        .map((b) => `<img class="club-sdg" src="${escapeHtml(b.url)}" alt="UN Sustainable Development Goal ${b.number}" title="UN Sustainable Development Goal ${b.number}" />`)
        .join('')}</div>`
    : '';
  return `
    <div class="cs-club-head">
      ${club.logoUrl ? `<img class="cs-club-logo" src="${escapeHtml(club.logoUrl)}" alt="${escapeHtml(club.name)} logo" />` : ''}
      <h3>${escapeHtml(club.name)}</h3>
      ${badges}
    </div>`;
}

async function loadClubs(type, listId, emptyId, tag, className, toHtml) {
  const data = await fetchJson(`/api/clubs?type=${type}`);
  if (!data) return;
  renderList(document.getElementById(listId), document.getElementById(emptyId), data.clubs, tag, className, toHtml);
}

const loaders = [
  loadClubs('community-service', 'cs-clubs-list', 'cs-clubs-empty', 'article', 'cs-club-card', (club) => `
    ${clubHeadHtml(club)}
    ${clubDetailsHtml(club)}
    ${club.applicationFormUrl ? `
      <div class="cs-club-links">
        <a class="cs-club-link" href="${escapeHtml(club.applicationFormUrl)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Apply</span>
        </a>
      </div>` : ''}`),

  loadClubs('after-school', 'clubs-page-list', 'clubs-page-empty', 'article', 'club-page-card', (club) => `
    ${clubHeadHtml(club)}
    ${clubDetailsHtml(club)}
    ${club.schedule ? `<div class="club-page-meta"><span><strong>When:</strong>${escapeHtml(club.schedule)}</span></div>` : ''}
    ${club.signupUrl ? `<a class="club-page-signup" href="${escapeHtml(club.signupUrl)}" target="_blank" rel="noopener">Sign up</a>` : ''}`),
];

// The browser scrolls to a #hash before the cards above it exist, which
// leaves the target pushed down the page, so scroll again once both are in.
Promise.all(loaders).then(() => {
  if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
});
