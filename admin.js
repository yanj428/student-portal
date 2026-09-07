const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');

const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createSuccess = document.getElementById('create-success');
const createSubmit = document.getElementById('create-submit');
const generatePasswordBtn = document.getElementById('generate-password');
const tempPasswordInput = document.getElementById('temp-password');

const studentRows = document.getElementById('student-rows');
const emptyRow = document.getElementById('empty-row');
const studentCount = document.getElementById('student-count');

function showAdminPanel() {
  gate.hidden = true;
  adminPage.hidden = false;
  loadStudents();
}

function showGate() {
  gate.hidden = false;
  adminPage.hidden = true;
}

async function checkSession() {
  const res = await fetch('/api/admin/session');
  const data = await res.json();
  if (data.isAdmin) showAdminPanel();
  else showGate();
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.hidden = true;

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPasswordInput.value }),
  });

  if (!res.ok) {
    gateError.hidden = false;
    return;
  }
  adminPasswordInput.value = '';
  showAdminPanel();
});

adminLogout.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showGate();
});

generatePasswordBtn.addEventListener('click', () => {
  const specials = '!@#$%^&*';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

  const raw = pick(upper, 1) + pick(lower, 4) + pick(digits, 4) + pick(specials, 1);
  tempPasswordInput.value = raw.split('').sort(() => Math.random() - 0.5).join('');
  tempPasswordInput.type = 'text';
});

async function loadStudents() {
  const res = await fetch('/api/admin/students');
  if (!res.ok) return;
  const { students } = await res.json();
  renderStudents(students);
}

function renderStudents(students) {
  studentCount.textContent = students.length;
  studentRows.innerHTML = '';

  if (students.length === 0) {
    studentRows.appendChild(emptyRow);
    return;
  }

  students
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((student) => {
      const tr = document.createElement('tr');
      const created = new Date(student.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      tr.innerHTML = `
        <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="grade-pill">${escapeHtml(student.grade)}</span></td>
        <td>${created}</td>
        <td><button class="delete-btn" data-id="${student.id}" aria-label="Remove account"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      `;
      studentRows.appendChild(tr);
    });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteStudent(btn.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function deleteStudent(id) {
  if (!confirm('Remove this student account? This cannot be undone.')) return;
  const res = await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
  if (res.ok) loadStudents();
}

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createError.hidden = true;
  createSuccess.hidden = true;
  createSubmit.disabled = true;
  createSubmit.textContent = 'Creating…';

  const payload = {
    firstName: document.getElementById('first-name').value.trim(),
    lastName: document.getElementById('last-name').value.trim(),
    email: document.getElementById('student-email').value.trim(),
    grade: document.getElementById('grade').value,
    password: tempPasswordInput.value,
  };

  try {
    const res = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      createError.textContent = data.error || 'Could not create account.';
      createError.hidden = false;
      return;
    }

    createSuccess.textContent = `Account created for ${data.student.firstName} ${data.student.lastName}. Share the temporary password with them directly.`;
    createSuccess.hidden = false;
    createForm.reset();
    loadStudents();
  } catch {
    createError.textContent = 'Could not reach the server. Please try again.';
    createError.hidden = false;
  } finally {
    createSubmit.disabled = false;
    createSubmit.textContent = 'Create account';
  }
});

checkSession();
