const INSTAGRAM_ICON = '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/></svg>';
const CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 9H21M8 2V5M16 2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7V12L15 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M17 7H9M17 7V15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const clubsById = new Map();

// The club's logo, or its first letter on a maroon tint when it has none.
function logoHtml(club, extraClass) {
  if (club.logoUrl) return `<span class="club-logo ${extraClass}"><img src="${escapeHtml(club.logoUrl)}" alt="" /></span>`;
  const letter = (club.name.trim()[0] || '?').toUpperCase();
  return `<span class="club-logo club-logo-letter ${extraClass}">${escapeHtml(letter)}</span>`;
}

// When an after school club meets: the day and time, then any place or other
// details the admin added. Clubs with none of these show nothing.
function meetingHtml(club) {
  const parts = [
    club.meetingDay ? `<span class="club-meeting-item">${CALENDAR_ICON}<span>${escapeHtml(club.meetingDay)}</span></span>` : '',
    club.meetingTime ? `<span class="club-meeting-item">${CLOCK_ICON}<span>${escapeHtml(club.meetingTime)}</span></span>` : '',
    club.schedule ? `<span class="club-meeting-item club-meeting-note">${escapeHtml(club.schedule)}</span>` : '',
  ].join('');
  return parts ? `<span class="club-meeting">${parts}</span>` : '';
}

function sdgHtml(club, className, limit) {
  const badges = limit ? club.sdgBadges.slice(0, limit) : club.sdgBadges;
  if (!badges.length) return '';
  return `<span class="club-sdgs">${badges
    .map((b) => `<img class="${className}" src="${escapeHtml(b.url)}" alt="UN Sustainable Development Goal ${b.number}" title="UN Sustainable Development Goal ${b.number}" />`)
    .join('')}</span>`;
}

function cardHtml(club) {
  return `
    <span class="club-card-top">${logoHtml(club, 'club-logo-sm')}<span class="club-card-name">${nameWithBreaks(club.name)}</span>${sdgHtml(club, 'club-sdg-sm', 4)}</span>
    ${club.mission ? `<span class="club-card-mission">${escapeHtml(club.mission)}</span>` : ''}
    ${meetingHtml(club)}`;
}

// Everything about one club, shown in the window that opens from its card.
function detailsHtml(club) {
  const section = (label, text) =>
    text ? `<div class="club-info-section"><h3>${label}</h3><p>${escapeHtml(text)}</p></div>` : '';
  const primaryUrl = club.type === 'community-service' ? club.applicationFormUrl : club.signupUrl;
  const primaryLabel = club.type === 'community-service' ? 'Apply' : 'Sign up';

  return `
    <div class="club-dialog-head">
      ${logoHtml(club, 'club-logo-lg')}
      <h2 id="club-dialog-title">${escapeHtml(club.name)}</h2>
      ${sdgHtml(club, 'club-sdg-lg', 0)}
    </div>
    ${meetingHtml(club)}
    ${section('Mission', club.mission)}
    ${section('Goals', club.goals)}
    ${section('Leader(s)', club.leaders)}
    ${section('Teacher advisor', club.advisor)}
    ${section('Contacts', club.contacts)}
    ${primaryUrl || club.instagramUrl ? `
      <div class="club-dialog-links">
        ${primaryUrl ? `<a class="club-primary-link" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener">${escapeHtml(primaryLabel)}${ARROW_ICON}</a>` : ''}
        ${club.instagramUrl ? `<a class="club-secondary-link" href="${escapeHtml(club.instagramUrl)}" target="_blank" rel="noopener">${INSTAGRAM_ICON}<span>Instagram</span></a>` : ''}
      </div>` : ''}`;
}

const dialog = document.getElementById('club-dialog');
const dialogBody = document.getElementById('club-dialog-body');
let opener = null;

function openClub(id, button) {
  const club = clubsById.get(id);
  if (!club) return;
  opener = button;
  dialogBody.innerHTML = detailsHtml(club);
  dialog.showModal();
  dialog.scrollTop = 0;
}
document.getElementById('club-dialog-close').addEventListener('click', () => dialog.close());
// A click on the dimmed area outside the window closes it.
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  if (opener) opener.focus();
  opener = null;
});

async function loadClubs(type, listId, emptyId) {
  const data = await fetchJson(`/api/clubs?type=${type}`);
  if (!data) return;
  data.clubs.forEach((club) => clubsById.set(club.id, club));
  renderList(
    document.getElementById(listId),
    document.getElementById(emptyId),
    data.clubs,
    'button',
    'club-card',
    cardHtml,
    (button, club) => {
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.addEventListener('click', () => openClub(club.id, button));
    }
  );
}

// The browser scrolls to a #hash before the cards above it exist, which
// leaves the target pushed down the page, so scroll again once both are in.
Promise.all([
  loadClubs('community-service', 'cs-clubs-list', 'cs-clubs-empty'),
  loadClubs('after-school', 'clubs-page-list', 'clubs-page-empty'),
]).then(() => {
  if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
});