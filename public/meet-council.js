const MC_PERSON_ICON = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 19C4.5 15.4 7.4 12.5 11 12.5H13C16.6 12.5 19.5 15.4 19.5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

const LEADERSHIP_ROLES = ['president', 'vice president'];
const isAdvisor = (role) => (role || '').trim().toLowerCase().includes('advisor');
const isLeadership = (role) => LEADERSHIP_ROLES.includes((role || '').trim().toLowerCase());

function photoHtml(member, className) {
  return `<span class="council-photo ${className}${member.photoUrl ? ' has-photo' : ''}">${
    member.photoUrl ? `<img src="${escapeHtml(member.photoUrl)}" alt="" />` : MC_PERSON_ICON
  }</span>`;
}

// The advisor, president and vice president: a larger card with a ringed
// photo, the position as a tag, then the name and grade.
function leaderCard(member) {
  const article = document.createElement('article');
  article.className = 'council-leader';
  article.innerHTML = `
    ${photoHtml(member, 'council-photo-lg')}
    ${member.role ? `<span class="council-tag${isAdvisor(member.role) ? ' council-tag-light' : ''}">${escapeHtml(member.role)}</span>` : ''}
    <h3>${escapeHtml(member.name || '')}</h3>
    ${member.grade ? `<p class="council-grade">${escapeHtml(member.grade)}</p>` : ''}`;
  return article;
}

// Everyone else: a compact card with a small photo beside the details.
function memberCard(member) {
  const article = document.createElement('article');
  article.className = 'council-member';
  article.innerHTML = `
    ${photoHtml(member, 'council-photo-sm')}
    <div class="council-member-text">
      <h3>${escapeHtml(member.name || '')}</h3>
      ${member.role ? `<p class="council-role">${escapeHtml(member.role)}</p>` : ''}
      ${member.grade ? `<p class="council-grade">${escapeHtml(member.grade)}</p>` : ''}
    </div>`;
  return article;
}

function section(label, members, buildBody) {
  if (members.length === 0) return null;
  const el = document.createElement('section');
  el.className = 'council-section';
  el.innerHTML = `<div class="council-section-head"><h2>${escapeHtml(label)}</h2><span class="council-count">${members.length} ${members.length === 1 ? 'member' : 'members'}</span></div>`;
  buildBody(el);
  return el;
}

function grid(className, items, build) {
  if (items.length === 0) return null;
  const el = document.createElement('div');
  el.className = className;
  items.forEach((item) => el.appendChild(build(item)));
  return el;
}

// A Student Council: the advisor(s), president and vice president on top, then
// everyone else. Each part only appears if it has people, so a council with no
// advisor on file doesn't show an empty slot.
function studentCouncil(label, members) {
  return section(label, members, (el) => {
    const advisors = members.filter((m) => isAdvisor(m.role));
    const leadership = members.filter((m) => !isAdvisor(m.role) && isLeadership(m.role));
    const others = members.filter((m) => !isAdvisor(m.role) && !isLeadership(m.role));
    [grid('council-leaders', [...advisors, ...leadership], leaderCard), grid('council-members', others, memberCard)]
      .filter(Boolean)
      .forEach((part) => el.appendChild(part));
  });
}

function generalCouncil(label, members) {
  return section(label, members, (el) => {
    el.appendChild(grid('council-members', members, memberCard));
  });
}

async function loadCouncilPage() {
  const data = await fetchJson('/api/council');
  if (!data) return;
  const { council } = data;

  const treeEl = document.getElementById('council-tree');
  const overallEmptyEl = document.getElementById('council-page-empty');
  overallEmptyEl.hidden = council.length > 0;
  treeEl.hidden = council.length === 0;
  treeEl.innerHTML = '';

  const byBucket = (level, group) => council.filter((m) => (m.level === 'ms' ? 'ms' : 'hs') === level && (m.group === 'general-council' ? 'general-council' : 'student-council') === group);

  [
    studentCouncil('HS Student Council', byBucket('hs', 'student-council')),
    studentCouncil('MS Student Council', byBucket('ms', 'student-council')),
    generalCouncil('HS General Council', byBucket('hs', 'general-council')),
    generalCouncil('MS General Council', byBucket('ms', 'general-council')),
  ]
    .filter(Boolean)
    .forEach((el) => treeEl.appendChild(el));
}

loadCouncilPage();