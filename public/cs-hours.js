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
  list: document.getElementById('hrs-list'),
  empty: document.getElementById('hrs-empty'),
  more: document.getElementById('hrs-more'),
};

// The newest few reports show straight away; the rest sit behind Show all.
const HRS_FIRST_SHOWN = 5;

let hrsEntries = [];
let hrsShowAll = false;
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

function entryHtml(entry) {
  const [, , day] = entry.date.split('-');
  const month = formatEntryDate(entry.date, { withYear: false }).split(' ')[0];
  const canChange = entry.status !== 'approved';
  const open = hrsOpen.has(entry.id);
  return `
    <div class="hrs-entry-top">
      <div class="hrs-date" aria-hidden="true"><span>${escapeHtml(month.toUpperCase())}</span><strong>${Number(day)}</strong></div>
      <div class="hrs-entry-main">
        <p class="hrs-entry-activity">${entry.isNew ? '<span class="hrs-new">New reply</span>' : ''}${escapeHtml(entry.title)}</p>
        <p class="hrs-entry-sub">${escapeHtml(reportWith(entry))} &middot; ${escapeHtml(reportDates(entry))} &middot; ${escapeHtml(hoursWord(entry.hours))}</p>
        ${entry.note ? `<p class="hrs-entry-note"><strong>Ms. Gia:</strong> ${escapeHtml(entry.note)}</p>` : ''}
        <div class="hrs-entry-actions">
          <button type="button" class="hrs-link" data-toggle="${escapeHtml(entry.id)}" aria-expanded="${open}">${open ? 'Hide report' : 'View report'}</button>
          ${canChange ? `<a class="hrs-link" href="/service-report?id=${encodeURIComponent(entry.id)}">${entry.status === 'rejected' ? 'Fix and resubmit' : 'Edit'}</a>
          <button type="button" class="hrs-link danger" data-delete="${escapeHtml(entry.id)}">Delete</button>` : ''}
        </div>
      </div>
      <span class="hrs-status status-${escapeHtml(entry.status)}">${escapeHtml(HOURS_STATUS_LABEL[entry.status] || entry.status)}</span>
    </div>
    ${open ? reportDetailsHtml(entry) : ''}`;
}

function renderHoursList() {
  const shown = hrsShowAll ? hrsEntries : hrsEntries.slice(0, HRS_FIRST_SHOWN);
  renderList(hrs.list, hrs.empty, shown, 'article', 'hrs-entry', entryHtml, (el, entry) => {
    el.classList.add(`status-${entry.status}`);
  });
  hrs.more.hidden = hrsEntries.length <= HRS_FIRST_SHOWN;
  hrs.more.textContent = hrsShowAll ? 'Show fewer' : `Show all ${hrsEntries.length} reports`;
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
  renderHoursSummary(data.totals, data.targets);
  renderHoursList();
}

loadHours();
