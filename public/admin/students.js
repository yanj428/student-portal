import { escapeHtml, getJSON, sendJSON, confirmDelete, withBusy, TRASH_ICON } from './api.js';
import { crudPanel } from './crud.js';

const createForm = document.getElementById('create-form');
const createError = document.getElementById('create-error');
const createSuccess = document.getElementById('create-success');
const createSubmit = document.getElementById('create-submit');

const studentRows = document.getElementById('student-rows');
const emptyRow = document.getElementById('empty-row');
const studentCount = document.getElementById('student-count');
const gradeSummary = document.getElementById('grade-summary');
const listBody = document.getElementById('student-list-body');

let allStudents = [];
// The grade whose accounts are showing. The list is long, so it stays folded
// away (null) until a grade button is pressed.
let openGrade = null;

export async function loadStudents() {
  const data = await getJSON('/api/admin/students');
  if (!data) return;
  allStudents = data.students;
  renderStudents();
}

function renderStudents() {
  const students = allStudents;

  studentCount.textContent = students.length;
  document.getElementById('stat-students').textContent = students.length;
  studentRows.innerHTML = '';
  gradeSummary.innerHTML = '';

  if (students.length === 0) {
    studentRows.appendChild(emptyRow);
    listBody.hidden = false;
    return;
  }

  // Lowest grade first (a grade with no number sorts last), then by name.
  const gradeNumber = (grade) => {
    const n = parseInt(String(grade).replace(/\D+/g, ''), 10);
    return Number.isNaN(n) ? Infinity : n;
  };
  const sortedStudents = students
    .slice()
    .sort(
      (a, b) =>
        gradeNumber(a.grade) - gradeNumber(b.grade) ||
        String(a.grade).localeCompare(String(b.grade)) ||
        a.fullName.localeCompare(b.fullName)
    );
  const gradeCounts = new Map();
  sortedStudents.forEach((s) => gradeCounts.set(s.grade, (gradeCounts.get(s.grade) || 0) + 1));
  if (!gradeCounts.has(openGrade)) openGrade = null;

  // One button per grade with its account count; pressing it shows that grade's
  // accounts, and pressing it again folds them away.
  gradeCounts.forEach((count, grade) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ghost grade-btn${grade === openGrade ? ' active' : ''}`;
    btn.setAttribute('aria-pressed', String(grade === openGrade));
    btn.innerHTML = `${escapeHtml(grade)} <span class="grade-btn-count">${count}</span>`;
    btn.addEventListener('click', () => {
      openGrade = openGrade === grade ? null : grade;
      renderStudents();
    });
    gradeSummary.appendChild(btn);
  });
  listBody.hidden = openGrade === null;

  sortedStudents
    .filter((student) => student.grade === openGrade)
    .forEach((student) => {
      const name = student.fullName;
      const created = new Date(student.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(name)}${student.locked ? ' <span class="lock-badge">Locked</span>' : ''}</td>
        <td>${escapeHtml(student.email)}</td>
        <td><span class="grade-pill">${escapeHtml(student.grade)}</span></td>
        <td>${created}</td>
        <td><button class="edit-btn" aria-label="Edit account">Edit</button></td>
        <td><button class="reset-btn" aria-label="Reset password">Reset password</button></td>
        <td><button class="lock-toggle-btn" aria-label="${student.locked ? 'Unlock account' : 'Lock account'}">${student.locked ? 'Unlock' : 'Lock'}</button></td>
        <td><button class="delete-btn" aria-label="Remove account">${TRASH_ICON}</button></td>
      `;
      // Bound per row (not by querying the whole page for .delete-btn, which
      // every other panel's rows share).
      tr.querySelector('.edit-btn').addEventListener('click', () => {
        createSuccess.hidden = true;
        panel.startEdit(student);
      });
      tr.querySelector('.reset-btn').addEventListener('click', () => resetStudentPassword(student, name));
      tr.querySelector('.lock-toggle-btn').addEventListener('click', () => toggleLock(student, name));
      tr.querySelector('.delete-btn').addEventListener('click', () =>
        confirmDelete(`/api/admin/students/${student.id}`, 'Remove this student account? This cannot be undone.', () => {
          panel.reset();
          loadStudents();
        })
      );
      studentRows.appendChild(tr);
    });
}

// Runs a POST on a student and reloads the list, reporting failures.
async function studentAction(student, action, failureMessage) {
  try {
    const { ok, data } = await sendJSON(`/api/admin/students/${student.id}/${action}`, 'POST', {});
    if (!ok) {
      alert(data.error || failureMessage);
      return null;
    }
    loadStudents();
    return data;
  } catch {
    alert('Could not reach the server. Please try again.');
    return null;
  }
}

async function toggleLock(student, name) {
  const action = student.locked ? 'unlock' : 'lock';
  if (!confirm(`${student.locked ? 'Unlock' : 'Lock'} ${name}'s account?`)) return;
  await studentAction(student, action, `Could not ${action} the account.`);
}

async function resetStudentPassword(student, name) {
  if (!confirm(`Reset ${name}'s password to the default password? This will also unlock the account if it's locked.`)) return;
  const data = await studentAction(student, 'reset-password', 'Could not reset password.');
  if (data) alert(`${name}'s password has been reset to: ${data.password}`);
}

const field = (id) => document.getElementById(id);
const gradeSelect = field('grade');

const panel = crudPanel({
  form: createForm,
  submitBtn: createSubmit,
  cancelBtn: field('create-cancel-edit'),
  errorEl: createError,
  endpoint: '/api/admin/students',
  addLabel: 'Create account',
  saveError: 'Could not save the account.',
  readPayload: () => {
    createSuccess.hidden = true;
    return {
      firstName: field('first-name').value.trim(),
      middleName: field('middle-name').value.trim(),
      lastName: field('last-name').value.trim(),
      nickname: field('nickname').value.trim(),
      email: field('student-email').value.trim(),
      grade: gradeSelect.value,
    };
  },
  fill: (student) => {
    field('first-name').value = student.firstName;
    field('middle-name').value = student.middleName;
    field('last-name').value = student.lastName;
    field('nickname').value = student.nickname;
    field('student-email').value = student.email;
    // A grade typed some other way (e.g. just "10") still needs to show up.
    if (![...gradeSelect.options].some((o) => o.value === student.grade)) {
      gradeSelect.add(new Option(student.grade, student.grade));
    }
    gradeSelect.value = student.grade;
  },
  onSaved: (data, wasEditing) => {
    createSuccess.textContent = wasEditing
      ? `Saved changes for ${data.student.fullName}.`
      : `Account created for ${data.student.fullName}. Default password: ${data.password}`;
    createSuccess.hidden = false;
  },
  reload: () => loadStudents(),
});
