// Admin password gate: shows the gate or the panel depending on session
// state, and calls back into main.js's loaders once logged in.

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');

export function initAuth(onLogin) {
  function showAdminPanel() {
    gate.hidden = true;
    adminPage.hidden = false;
    onLogin();
  }

  function showGate() {
    gate.hidden = false;
    adminPage.hidden = true;
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

  (async function checkSession() {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (data.isAdmin) showAdminPanel();
    else showGate();
  })();
}
