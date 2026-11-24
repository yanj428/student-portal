// The My service hours card on the Community Service page: a student's total,
// progress toward the hours needed to graduate and this year's recommended
// hours, and their project reports.

const hrs = {
  approved: document.getElementById('hrs-approved'),
  totalText: document.getElementById('hrs-total-text'),
  progress: document.getElementById('hrs-progress'),
  progressBar: document.getElementById('hrs-progress-bar'),
  yearText: document.getElementById('hrs-year-text'),
  yearProgress: document.getElementById('hrs-year-progress'),
  yearBar: document.getElementById('hrs-year-bar'),
  pending: document.getElementById('hrs-pending'),
  grades: document.getElementById('hrs-grades'),
  grand: document.getElementById('hrs-grand'),
  filters: document.getElementById('hrs-filters'),
  list: document.getElementById('hrs-list'),
  empty: document.getElementById('hrs-empty'),
  more: document.getElementById('hrs-more'),
};

// The newest few reports show straight away; the rest sit behind Show all.
const HRS_FIRST_SHOWN = 5;

let hrsEntries = [];
let hrsShowAll = false;
let hrsFilter = 'all';
let hrsYearStart = '';
// Reports opened to read in full.
const hrsOpen = new Set();

hrs.more.addEventListener('click', () => {
  hrsShowAll = !hrsShowAll;
  renderHoursList();
});

// Fills a progress bar. Its width is set from script because the site's
// Content-Security-Policy blocks style="" attributes in HTML.
function setProgress(bar, fill, done, target) {
  const percent = Math.min(100, Math.round((done / target) * 100));
  bar.setAttribute('aria-valuenow', String(percent));
  fill.style.width = `${percent}%`;
  bar.classList.toggle('done', done >= target);
}

function renderHoursSummary(totals, targets) {
  hrs.approved.textContent = formatHours(totals.approved);
  hrs.totalText.textContent = totals.approved >= targets.total
    ? `of ${formatHours(targets.total)} hours. You have all the hours you need to graduate!`
    : `of ${formatHours(targets.total)} hours to graduate`;
  setProgress(hrs.progress, hrs.progressBar, totals.approved, targets.total);

  hrs.yearText.innerHTML = totals.approvedThisYear >= targets.yearly
    ? `<strong>This school year:</strong> ${escapeHtml(hoursWord(totals.approvedThisYear))}. You reached the recommended ${escapeHtml(formatHours(targets.yearly))}!`
    : `<strong>This school year:</strong> ${escapeHtml(formatHours(totals.approvedThisYear))} of ${escapeHtml(formatHours(targets.yearly))} recommended hours`;
  setProgress(hrs.yearProgress, hrs.yearBar, totals.approvedThisYear, targets.yearly);

  hrs.pending.hidden = totals.pending === 0;
  hrs.pending.textContent = `${hoursWord(totals.pending)} waiting for approval`;
}

// 14-Dec-2023, the way the school's sheet writes it.
function sheetDate(iso) {
  if (!iso) return '\u2014';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}-${y}`;
}

function entryHtml(entry) {
  const canChange = entry.status !== 'approved';
  const open = entry.hasReport && hrsOpen.has(entry.id);
  const [tag, attrs] = entry.hasReport ? ['button', ` type="button" data-toggle="${escapeHtml(entry.id)}" aria-expanded="${open}"`] : ['div', ''];
  return `
    <${tag} class="hrs-entry-top${entry.hasReport ? '' : ' static'}"${attrs}>
      <span>${escapeHtml(sheetDate(entry.date))}</span>
      <span>${entry.grade || ''}</span>
      <span class="hrs-act">${entry.isNew ? '<span class="hrs-new">New reply</span>' : ''}${escapeHtml(entry.title)}${entry.hasReport ? `<span class="hrs-chev" aria-hidden="true">${open ? '&#9650;' : '&#9660;'}</span>` : ''}</span>
      <span class="hrs-num">${escapeHtml(formatHours(entry.hours))}</span>
      <span>${escapeHtml(entry.advisorName)}</span>
      <span class="hrs-status status-${escapeHtml(entry.status)}">${escapeHtml(entry.status === 'pending' && entry.resubmitted ? 'Resubmitted, waiting' : HOURS_STATUS_LABEL[entry.status] || entry.status)}</span>
      <span>${escapeHtml(entry.approvedBy || '')}</span>
    </${tag}>
    ${open ? `<div class="hrs-detail">
      <p class="hrs-entry-sub">${escapeHtml(reportWith(entry))} &middot; ${escapeHtml(reportDates(entry))}</p>
      ${entry.note ? `<p class="hrs-entry-note"><strong>${escapeHtml(entry.noteFrom)}:</strong> ${escapeHtml(entry.note)}</p>` : ''}
      ${reportDetailsHtml(entry)}
      ${canChange ? `<div class="hrs-entry-actions"><a class="hrs-link" href="/service-report?id=${encodeURIComponent(entry.id)}">${entry.status === 'rejected' ? 'Fix and resubmit' : 'Edit'}</a>
        <button type="button" class="hrs-link danger" data-delete="${escapeHtml(entry.id)}">Delete</button></div>` : ''}
    </div>` : ''}`;
}

function visibleEntries() {
  if (hrsFilter === 'year') return hrsEntries.filter((e) => e.date >= hrsYearStart);
  if (hrsFilter === 'pending') return hrsEntries.filter((e) => e.status === 'pending');
  return hrsEntries;
}

function renderHoursList() {
  const matching = visibleEntries();
  const shown = hrsShowAll ? matching : matching.slice(0, HRS_FIRST_SHOWN);
  renderList(hrs.list, hrs.empty, shown, 'article', 'hrs-entry', entryHtml, (el, entry) => {
    el.classList.add(`status-${entry.status}`);
    el.classList.toggle('open', hrsOpen.has(entry.id));
  });
  hrs.more.hidden = matching.length <= HRS_FIRST_SHOWN;
  hrs.more.textContent = hrsShowAll ? 'Show fewer' : `Show all ${matching.length} reports`;
}

hrs.filters.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  hrsFilter = chip.dataset.filter;
  hrs.filters.querySelectorAll('[data-filter]').forEach((c) => {
    c.classList.toggle('on', c === chip);
    c.setAttribute('aria-pressed', String(c === chip));
  });
  renderHoursList();
});

function renderGradeTotals(gradeTotals, grand) {
  hrs.grades.innerHTML = [9, 10, 11, 12]
    .map((g) => `<tr><th scope="row">${g}</th><td>${escapeHtml(formatHours(gradeTotals[g] || 0))}</td></tr>`)
    .join('');
  hrs.grand.textContent = formatHours(grand);
}

hrs.list.addEventListener('click', async (e) => {
  const toggleId = e.target.closest('[data-toggle]')?.dataset.toggle;
  const deleteId = e.target.closest('[data-delete]')?.dataset.delete;
  if (toggleId) {
    if (hrsOpen.has(toggleId)) hrsOpen.delete(toggleId);
    else hrsOpen.add(toggleId);
    renderHoursList();
  }
  if (deleteId) {
    if (!confirm('Delete this report and its photos? This cannot be undone.')) return;
    try {
      const { ok, data } = await sendHoursJson(`/api/cs-hours/${deleteId}`, 'DELETE');
      if (!ok) return alert(data.error || 'Could not delete the report.');
      loadHours();
    } catch {
      alert('Could not reach the server. Please try again.');
    }
  }
});

// The menu's "new replies" count was drawn before this page marked them as
// seen, so it is taken away here rather than waiting for the next page.
function clearReplyBadges() {
  document.querySelectorAll('[data-page="community-service"] .nav-badge, .more-item[href="/community-service"] .nav-badge').forEach((b) => b.remove());
  if (!document.querySelector('.more-item .nav-badge')) document.querySelectorAll('.tab-dot').forEach((d) => d.remove());
}

async function loadHours() {
  const data = await fetchJson('/api/cs-hours?seen=1');
  if (!data) return;
  clearReplyBadges();
  hrsEntries = data.entries;
  hrsYearStart = `${Number(data.today.slice(5, 7)) >= 8 ? data.today.slice(0, 4) : Number(data.today.slice(0, 4)) - 1}-08-01`;
  renderHoursSummary(data.totals, data.targets);
  renderGradeTotals(data.gradeTotals, data.totals.approved);
  renderHoursList();
}

loadHours();
