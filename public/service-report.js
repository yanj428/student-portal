// The community service Project Report form: a new report, or ?id=<report>
// to fix one that is waiting or was not approved.

const $ = (id) => document.getElementById(id);
const sr = {
  form: $('sr-form'),
  heading: $('sr-heading'),
  intro: $('sr-intro'),
  statusNote: $('sr-status-note'),
  title: $('sr-title'),
  club: $('sr-club'),
  clubField: $('sr-club-field'),
  org: $('sr-org'),
  orgField: $('sr-org-field'),
  start: $('sr-start'),
  end: $('sr-end'),
  sdgs: $('sr-sdgs'),
  need: $('sr-need'),
  goal: $('sr-goal'),
  plannedFields: $('sr-planned-fields'),
  plannedSkip: $('sr-planned-skip'),
  invSummary: $('sr-inv-summary'),
  invEvidence: $('sr-inv-evidence'),
  planSummary: $('sr-plan-summary'),
  action: $('sr-action'),
  links: $('sr-links'),
  addLink: $('sr-add-link'),
  reflection: $('sr-reflection'),
  tasks: $('sr-tasks'),
  addTask: $('sr-add-task'),
  total: $('sr-total'),
  advisor: $('sr-advisor'),
  advisorContact: $('sr-advisor-contact'),
  error: $('sr-error'),
  submit: $('sr-submit'),
  draftNote: $('sr-draft-note'),
  draftSaved: $('sr-draft-saved'),
};

const MAX_SDGS = 3;
const MAX_LINKS = 5;
const MAX_FILES = 10;
const MAX_TASKS = 30;

let clubs = [];
let evidence = []; // { id, name, mimetype, url, section }
let editingId = new URLSearchParams(window.location.search).get('id');

const withValue = () => sr.form.querySelector('input[name="sr-with"]:checked').value;
const isPlanned = () => sr.form.querySelector('input[name="sr-planned"]:checked').value === 'yes';

function showError(message) {
  sr.error.textContent = message;
  sr.error.hidden = !message;
  if (message) sr.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- Who it was with ----
function updateWith() {
  const value = withValue();
  sr.clubField.hidden = value !== 'club';
  sr.orgField.hidden = value !== 'org';
}
sr.form.querySelectorAll('input[name="sr-with"]').forEach((r) => r.addEventListener('change', updateWith));

// Choosing a club fills in its causes and advisor, unless the student has
// already picked their own.
sr.club.addEventListener('change', () => {
  const club = clubs.find((c) => c.id === sr.club.value);
  if (!club) return;
  if (!checkedSdgs().length) club.sdgs.slice(0, MAX_SDGS).forEach((n) => { sr.sdgs.querySelector(`input[value="${n}"]`).checked = true; });
  if (!sr.advisor.value.trim() && club.advisor) sr.advisor.value = club.advisor;
  updateSdgLimit();
});

// ---- Causes ----
const checkedSdgs = () => [...sr.sdgs.querySelectorAll('input:checked')].map((i) => Number(i.value));
function updateSdgLimit() {
  const full = checkedSdgs().length >= MAX_SDGS;
  sr.sdgs.querySelectorAll('input').forEach((i) => { i.disabled = full && !i.checked; });
}
sr.sdgs.addEventListener('change', updateSdgLimit);

function renderSdgs(goals) {
  sr.sdgs.innerHTML = goals
    .map((g) => `
      <label class="sr-sdg">
        <input type="checkbox" value="${g.number}" />
        <span class="sr-sdg-box">${g.url ? `<img src="${escapeHtml(g.url)}" alt="" />` : `<b>${g.number}</b>`}<span>${escapeHtml(g.name)}</span></span>
      </label>`)
    .join('');
}

// ---- Planned or joined ----
function updatePlanned() {
  sr.plannedFields.hidden = !isPlanned();
  sr.plannedSkip.hidden = isPlanned();
}
sr.form.querySelectorAll('input[name="sr-planned"]').forEach((r) => r.addEventListener('change', updatePlanned));

// ---- Evidence files ----
function renderFiles() {
  for (const section of ['planning', 'action']) {
    $(`sr-files-${section}`).innerHTML = evidence
      .filter((e) => e.section === section)
      .map((e) => `
        <div class="sr-file">
          ${e.mimetype.startsWith('image/') ? `<img src="${escapeHtml(e.url)}" alt="" />` : '<span class="sr-file-pdf">PDF</span>'}
          <span class="sr-file-name">${escapeHtml(e.name)}</span>
          <button type="button" class="sr-remove" data-remove-file="${escapeHtml(e.id)}" aria-label="Remove ${escapeHtml(e.name)}">&times;</button>
        </div>`)
      .join('');
  }
}

sr.form.addEventListener('click', (e) => {
  const fileId = e.target.closest('[data-remove-file]')?.dataset.removeFile;
  if (fileId) {
    evidence = evidence.filter((x) => x.id !== fileId);
    renderFiles();
  }
});

// Phone photos are 3-5 MB and the server's storage is small, so a photo is
// redrawn at most 1600 pixels on its longest side and saved as a JPEG before
// it is sent: still sharp on any screen, about a tenth of the size. Redrawing
// also drops the hidden location data phone cameras add, and turns iPhone
// HEIC photos (where the browser can open them) into JPEGs the server accepts.
// PDFs and GIFs are sent as they are; so is anything the browser cannot open.
const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.82;

async function shrinkPhoto(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  // A transparent PNG would otherwise turn black as a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
  if (!blob) return file;
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

sr.form.querySelectorAll('.sr-upload input[type="file"]').forEach((input) => {
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    const label = input.closest('.sr-upload');
    showError('');
    for (const file of files) {
      if (evidence.length >= MAX_FILES) {
        showError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      label.classList.add('busy');
      try {
        const body = new FormData();
        body.append('file', await shrinkPhoto(file));
        const res = await fetch('/api/cs-hours/evidence', { method: 'POST', body });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showError(`${file.name}: ${data.error || 'Could not upload.'}`);
          continue;
        }
        evidence.push({ ...data.evidence, section: input.dataset.section });
        renderFiles();
      } catch {
        showError('Could not reach the server. Please try again.');
      } finally {
        label.classList.remove('busy');
      }
    }
  });
});

// ---- Links ----
function addLinkRow(value = '') {
  if (sr.links.children.length >= MAX_LINKS) return;
  const row = document.createElement('div');
  row.className = 'sr-row';
  row.innerHTML = `
    <input class="hrs-input" type="url" placeholder="https://..." aria-label="Evidence link" maxlength="500" />
    <button type="button" class="sr-remove" aria-label="Remove link">&times;</button>`;
  row.querySelector('input').value = value;
  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    sr.addLink.hidden = false;
  });
  sr.links.appendChild(row);
  sr.addLink.hidden = sr.links.children.length >= MAX_LINKS;
}
sr.addLink.addEventListener('click', () => {
  addLinkRow();
  sr.links.lastElementChild.querySelector('input').focus();
});

// ---- Hours by task ----
function updateTotal() {
  const total = [...sr.tasks.querySelectorAll('.sr-task-hours')].reduce((n, i) => n + (Number(i.value) || 0), 0);
  sr.total.textContent = hoursWord(Math.round(total * 100) / 100);
}

function addTaskRow(task = { task: '', hours: '' }) {
  if (sr.tasks.children.length >= MAX_TASKS) return;
  const row = document.createElement('div');
  row.className = 'sr-row sr-task';
  row.innerHTML = `
    <input class="hrs-input" maxlength="120" placeholder="e.g. Sorting donated books" aria-label="Task" />
    <input class="hrs-input sr-task-hours" type="number" min="0.25" step="0.25" inputmode="decimal" placeholder="Hours" aria-label="Hours for this task" />
    <button type="button" class="sr-remove" aria-label="Remove task">&times;</button>`;
  const [name, hours] = row.querySelectorAll('input');
  name.value = task.task;
  hours.value = task.hours;
  hours.addEventListener('input', updateTotal);
  row.querySelector('button').addEventListener('click', () => {
    if (sr.tasks.children.length === 1) return;
    row.remove();
    updateTotal();
    sr.addTask.hidden = false;
  });
  sr.tasks.appendChild(row);
  sr.addTask.hidden = sr.tasks.children.length >= MAX_TASKS;
  updateTotal();
}
sr.addTask.addEventListener('click', () => {
  addTaskRow();
  sr.tasks.lastElementChild.querySelector('input').focus();
});

// ---- The form's contents as one object (sent on submit, kept as the draft) ----
function formState() {
  return {
    with: withValue(),
    title: sr.title.value,
    clubId: sr.club.value,
    organization: sr.org.value,
    startDate: sr.start.value,
    endDate: sr.end.value,
    sdgs: checkedSdgs(),
    need: sr.need.value,
    goal: sr.goal.value,
    planned: isPlanned(),
    investigationSummary: sr.invSummary.value,
    investigationEvidence: sr.invEvidence.value,
    planningSummary: sr.planSummary.value,
    actionSummary: sr.action.value,
    links: [...sr.links.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean),
    evidence: evidence.map((x) => ({ ...x })),
    reflection: sr.reflection.value,
    tasks: [...sr.tasks.children].map((row) => {
      const [name, hours] = row.querySelectorAll('input');
      return { task: name.value, hours: hours.value };
    }),
    advisorName: sr.advisor.value,
    advisorContact: sr.advisorContact.value,
  };
}

function fillState(state) {
  sr.title.value = state.title || '';
  sr.form.querySelector(`input[name="sr-with"][value="${['club', 'org', 'own'].includes(state.with) ? state.with : 'club'}"]`).checked = true;
  sr.club.value = clubs.some((c) => c.id === state.clubId) ? state.clubId : '';
  sr.org.value = state.organization || '';
  if (state.startDate) sr.start.value = state.startDate;
  sr.end.value = state.endDate || '';
  sr.sdgs.querySelectorAll('input').forEach((box) => { box.checked = (state.sdgs || []).includes(Number(box.value)); });
  sr.need.value = state.need || '';
  sr.goal.value = state.goal || '';
  sr.form.querySelector(`input[name="sr-planned"][value="${state.planned ? 'yes' : 'no'}"]`).checked = true;
  sr.invSummary.value = state.investigationSummary || '';
  sr.invEvidence.value = state.investigationEvidence || '';
  sr.planSummary.value = state.planningSummary || '';
  sr.action.value = state.actionSummary || '';
  evidence = (state.evidence || []).map((x) => ({ ...x }));
  sr.links.innerHTML = '';
  (state.links || []).forEach((l) => addLinkRow(l));
  sr.addLink.hidden = sr.links.children.length >= MAX_LINKS;
  sr.reflection.value = state.reflection || '';
  sr.tasks.innerHTML = '';
  (state.tasks && state.tasks.length ? state.tasks : [{ task: '', hours: '' }]).forEach((t) => addTaskRow(t));
  sr.advisor.value = state.advisorName || '';
  sr.advisorContact.value = state.advisorContact || '';
  updateWith();
  updatePlanned();
  updateSdgLimit();
  renderFiles();
}

// ---- Fill in a report being fixed ----
function fill(entry) {
  fillState({
    ...entry,
    with: entry.clubId ? 'club' : entry.organization ? 'org' : 'own',
    startDate: entry.date,
    sdgs: entry.sdgs.map((g) => g.number),
  });
  sr.heading.textContent = 'Fix your report';
  sr.intro.textContent = 'Saving sends this report back to Ms. Gia for approval.';
  sr.submit.textContent = 'Save and resubmit';
  if (entry.status === 'rejected' && entry.note) {
    sr.statusNote.innerHTML = `<strong>Ms. Gia said:</strong> ${escapeHtml(entry.note)}`;
    sr.statusNote.hidden = false;
  }
}

// ---- Drafts ----
// The form is long, so what the student types is kept in this browser as they
// go and brought back if they leave and return before submitting. The key
// includes their account, so on a shared computer nobody else's draft appears.
const DRAFT_KEY = `kpis-service-report:${sr.form.dataset.student}:${editingId || 'new'}`;
let draftReady = false;
let draftTimer = null;

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked (private window): there is no draft to clear.
  }
}
function saveDraftSoon() {
  if (!draftReady) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), state: formState() }));
      sr.draftSaved.hidden = false;
    } catch {
      // Storage full or blocked: the form still works, just without a draft.
    }
  }, 600);
}
['input', 'change', 'click'].forEach((type) => sr.form.addEventListener(type, saveDraftSoon));

// A photo uploaded more than a day ago without being submitted is removed from
// the server, so a draft only brings back the files that are still there.
async function stillThere(files) {
  const checks = await Promise.all(files.map((f) => fetch(f.url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)));
  return files.filter((f, i) => checks[i]);
}

async function restoreDraft() {
  const draft = readDraft();
  if (!draft || !draft.state) return;
  const state = { ...draft.state, evidence: await stillThere(draft.state.evidence || []) };
  fillState(state);
  const when = new Date(draft.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dropped = (draft.state.evidence || []).length - state.evidence.length;
  sr.draftNote.innerHTML = `We brought back the draft you were writing (saved ${escapeHtml(when)}).${dropped ? ` ${dropped} attached ${dropped === 1 ? 'file has' : 'files have'} expired, so please attach ${dropped === 1 ? 'it' : 'them'} again.` : ''} <button type="button" class="hrs-link" id="sr-discard">Start over</button>`;
  sr.draftNote.hidden = false;
  $('sr-discard').addEventListener('click', () => {
    if (!confirm('Throw away this draft?')) return;
    clearDraft();
    window.location.reload();
  });
}

// ---- Submit ----
sr.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const state = formState();
  if (state.with === 'club' && !state.clubId) return showError('Please choose the club, or pick another option.');
  if (state.with === 'org' && !state.organization.trim()) return showError('Please type the name of the organization.');

  const body = {
    ...state,
    clubId: state.with === 'club' ? state.clubId : '',
    organization: state.with === 'org' ? state.organization : '',
    evidence: state.evidence.filter((x) => x.section === 'action' || state.planned).map(({ id, section }) => ({ id, section })),
    tasks: state.tasks
      .map((t) => ({ task: t.task, hours: t.hours === '' ? NaN : Number(t.hours) }))
      .filter((t) => t.task.trim() || !Number.isNaN(t.hours)),
  };
  delete body.with;

  sr.submit.disabled = true;
  try {
    const { ok, data } = await sendHoursJson(editingId ? `/api/cs-hours/${editingId}` : '/api/cs-hours', editingId ? 'PUT' : 'POST', body);
    if (!ok) return showError(data.error || 'Could not save your report.');
    draftReady = false;
    clearTimeout(draftTimer);
    clearDraft();
    window.location.href = '/community-service#hrs-card';
  } catch {
    showError('Could not reach the server. Please try again.');
  } finally {
    sr.submit.disabled = false;
  }
});

(async function init() {
  const options = await fetchJson('/api/cs-hours/options');
  if (!options) return;
  clubs = options.clubs;
  sr.club.insertAdjacentHTML('beforeend', clubs.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join(''));
  renderSdgs(options.sdgs);
  sr.start.max = options.today;
  sr.end.max = options.today;
  sr.start.value = options.today;

  if (editingId) {
    const data = await fetchJson('/api/cs-hours');
    const entry = data && data.entries.find((x) => x.id === editingId);
    if (!entry || entry.status === 'approved') {
      clearDraft();
      window.location.href = '/community-service';
      return;
    }
    fill(entry);
  } else {
    addTaskRow();
  }
  updateWith();
  updatePlanned();
  updateSdgLimit();
  renderFiles();
  await restoreDraft();
  draftReady = true;
})();
