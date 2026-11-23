// Shared by the student's My service hours card and the coordinator's
// Service Hours page.

// The student pages get escapeHtml from common.js; the admin panel does not
// load that file, so it gets the same function here.
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

const HOURS_STATUS_LABEL = { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Not approved' };

// 2 -> "2", 2.5 -> "2.5", 1.25 -> "1.25"
function formatHours(hours) {
  return String(Math.round(hours * 100) / 100);
}

function hoursWord(hours) {
  return `${formatHours(hours)} ${hours === 1 ? 'hour' : 'hours'}`;
}

// "2026-11-08" -> "Nov 8, 2026". Parsed as a plain calendar date so the
// viewer's own time zone can never move it to the day before.
function formatEntryDate(iso, { withYear = true } = {}) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
  });
}

// Sends JSON and returns { ok, data }. A session that ran out while the page
// was open goes back to the login page, the same as fetchJson does.
async function sendHoursJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = document.body.dataset.loginUrl || '/login';
    return { ok: false, data: {} };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// "Nov 8, 2026" or "Nov 8 - Nov 10, 2026".
function reportDates(entry) {
  if (!entry.endDate) return formatEntryDate(entry.date);
  const sameYear = entry.date.slice(0, 4) === entry.endDate.slice(0, 4);
  return `${formatEntryDate(entry.date, { withYear: !sameYear })} - ${formatEntryDate(entry.endDate)}`;
}

// "Done in Grade 10 · " before the rest of a report's details. The server
// works the grade out (the student's answer, an imported school record, or
// the date), so it is only missing when none of those is known.
function reportGrade(entry) {
  const grade = entry.grade || entry.serviceGrade;
  return grade ? `Done in Grade ${grade} · ` : '';
}

function reportWith(entry) {
  return entry.clubName || entry.organization || 'Own project';
}

function sdgBadgesHtml(entry) {
  return `<span class="sr-badges">${entry.sdgs
    .map((g) => (g.url
      ? `<img class="sr-badge" src="${escapeHtml(g.url)}" alt="UN goal ${g.number}: ${escapeHtml(g.name)}" title="${g.number}. ${escapeHtml(g.name)}" />`
      : `<span class="sr-badge sr-badge-text" title="${escapeHtml(g.name)}">${g.number}</span>`))
    .join('')}</span>`;
}

function paragraphs(text) {
  return `<p class="rp-text">${escapeHtml(text)}</p>`;
}

function evidenceHtml(files) {
  if (!files.length) return '';
  return `<div class="rp-files">${files
    .map((f) => (f.mimetype.startsWith('image/')
      ? `<a class="rp-photo" href="${escapeHtml(f.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.name)}" /></a>`
      : `<a class="rp-pdf" href="${escapeHtml(f.url)}"><span>PDF</span>${escapeHtml(f.name)}</a>`))
    .join('')}</div>`;
}

// Every section of a Project Report, in the same order as the form.
function reportDetailsHtml(entry) {
  const section = (title, body) => (body ? `<div class="rp-section"><h4>${escapeHtml(title)}</h4>${body}</div>` : '');
  const planning = entry.evidence.filter((f) => f.section === 'planning');
  const action = entry.evidence.filter((f) => f.section === 'action');
  const links = entry.links.length
    ? `<ul class="rp-links">${entry.links.map((l) => `<li><a href="${escapeHtml(l)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l)}</a></li>`).join('')}</ul>`
    : '';
  const tasks = `<table class="rp-tasks"><tbody>${entry.tasks
    .map((t) => `<tr><td>${escapeHtml(t.task)}</td><td>${escapeHtml(hoursWord(t.hours))}</td></tr>`)
    .join('')}<tr class="rp-tasks-total"><td>Total</td><td>${escapeHtml(hoursWord(entry.hours))}</td></tr></tbody></table>`;
  return `
    <div class="rp">
      <div class="rp-causes">${sdgBadgesHtml(entry)}<span>${entry.sdgs.map((g) => escapeHtml(g.name)).join(', ')}</span></div>
      ${section('What is the need in the community?', paragraphs(entry.need))}
      ${section('What is the goal for the project?', paragraphs(entry.goal))}
      ${entry.planned ? section('Investigation summary', paragraphs(entry.investigationSummary)) : ''}
      ${entry.planned && entry.investigationEvidence ? section('Investigation evidence', paragraphs(entry.investigationEvidence)) : ''}
      ${entry.planned ? section('Planning summary', paragraphs(entry.planningSummary)) : ''}
      ${planning.length ? section('Planning evidence', evidenceHtml(planning)) : ''}
      ${section('What they did', paragraphs(entry.actionSummary))}
      ${action.length || links ? section('Evidence', evidenceHtml(action) + links) : ''}
      ${section('Reflection', paragraphs(entry.reflection))}
      ${section('Hours by task', tasks)}
      ${section('Advisor', paragraphs([entry.advisorName, entry.advisorContact].filter(Boolean).join(' - ')))}
    </div>`;
}
