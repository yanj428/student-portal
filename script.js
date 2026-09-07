// Sidebar navigation (visual state only — pages beyond Dashboard are not built yet)
document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
  if (item.id === 'logout-link') return;
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// Today's date in the welcome banner
const dateEl = document.getElementById('today-date');
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Require login: pull the signed-in student from the session, or bounce to login.html
async function loadCurrentStudent() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = 'login.html';
      return;
    }
    const { student } = await res.json();

    document.getElementById('user-name').textContent = `${student.firstName} ${student.lastName}`;
    document.getElementById('user-grade').textContent = student.grade;
    document.getElementById('user-avatar').textContent =
      (student.firstName[0] || '') + (student.lastName[0] || '');
    document.getElementById('welcome-heading').textContent = `Welcome back, ${student.firstName}!`;
  } catch {
    window.location.href = 'login.html';
  }
}
loadCurrentStudent();

const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });
}
