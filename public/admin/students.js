import { escapeHtml, sendJSON, del } from './api.js';

const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createSuccess = document.getElementById('create-success');
const createSubmit = document.getElementById('create-submit');

const studentRows = document.getElementById('student-rows');
const emptyRow = document.getElementById('empty-row');
const studentCount = document.getElementById('student-count');

export async function loadStudents() {
  const res = await fetch('/api/admin/students');
  if (!res.ok) return;
  const { students } = await res.json();
  renderStudents(students);
}

function renderStudents(students) {
  studentCount.textContent = students.length;
  const statStudents = document.getElementById('stat-students');
  if (statStudents) statStudents.textContent = students.length;
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
        <td>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}${student.locked ? ' <span class="lock-badge">Locked</span>' : ''}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="grade-pill">${escapeHtml(student.grade)}</span></td>
        <td>${created}</td>
        <td><button class="reset-btn" data-id="${student.id}" data-name="${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}" aria-label="Reset password">Reset password</button></td>
        <td><button class="delete-btn" data-id="${student.id}" aria-label="Remove account"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H20M9 7V4C9 3.4 9.4 3 10 3H14C14.6 3 15 3.4 15 4V7M18 7L17.3 19C17.2 19.6 16.7 20 16.1 20H7.9C7.3 20 6.8 19.6 6.7 19L6 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      `;
      studentRows.appendChild(tr);
    });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteStudent(btn.dataset.id));
  });
  document.querySelectorAll('.reset-btn').forEach((btn) => {
    btn.addEventListener('click', () => resetStudentPassword(btn.dataset.id, btn.dataset.name));
  });
}

async function resetStudentPassword(id, name) {
  if (!confirm(`Reset ${name}'s password to the default password? This will also unlock the account if it's locked.`)) return;
  const { ok, data } = await sendJSON(`/api/admin/students/${id}/reset-password`, 'POST', {});
  if (!ok) {
    alert(data.error || 'Could not reset password.');
    return;
  }
  alert(`${name}'s password has been reset to: ${data.password}`);
  loadStudents();
}

async function deleteStudent(id) {
  if (!confirm('Remove this student account? This cannot be undone.')) return;
  const { ok } = await del(`/api/admin/students/${id}`);
  if (ok) loadStudents();
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
  };

  try {
    const { ok, data } = await sendJSON('/api/admin/students', 'POST', payload);

    if (!ok) {
      createError.textContent = data.error || 'Could not create account.';
      createError.hidden = false;
      return;
    }

    createSuccess.textContent = `Account created for ${data.student.firstName} ${data.student.lastName}. Default password: ${data.password}`;
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
