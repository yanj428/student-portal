// Admin login gate: username + password, then shows the panel and calls
// back into main.js's loaders.

const gate = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const adminUsernameInput = document.getElementById('admin-username');
const adminPasswordInput = document.getElementById('admin-password');
const gateError = document.getElementById('gate-error');
const adminPage = document.getElementById('admin-page');
const adminLogout = document.getElementById('admin-logout');
const currentAdminUsernameEl = document.getElementById('current-admin-username');

export function initAuth(onLogin) {
  function showAdminPanel(username) {
    gate.hidden = true;
    adminPage.hidden = false;
    if (currentAdminUsernameEl && username) currentAdminUsernameEl.textContent = username;
    onLogin();
  }

  function showGate() {
    gate.hidden = false;
    adminPage.hidden = true;
  }

  async function showError(el, res) {
    let message = 'Something went wrong. Please try again.';
    try {
      message = (await res.json()).error || message;
    } catch {
      // keep the default
    }
    el.textContent = message;
    el.hidden = false;
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.hidden = true;

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsernameInput.value, password: adminPasswordInput.value }),
    });

    if (!res.ok) {
      await showError(gateError, res);
      return;
    }
    const data = await res.json();
    adminPasswordInput.value = '';
    showAdminPanel(data.username);
  });

  adminLogout.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showGate();
  });

  (async function checkSession() {
    const res = await fetch('/api/admin/session');
    const data = await res.json();
    if (data.isAdmin) showAdminPanel(data.username);
    else showGate();
  })();
}
