// Tab toggle (Login / Sign Up) — visual only, both tabs point at the same form for now
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// Show/hide password
const pwInput = document.getElementById('password');
const pwToggle = document.querySelector('.toggle-pw');
if (pwInput && pwToggle) {
  pwToggle.addEventListener('click', () => {
    const showing = pwInput.type === 'text';
    pwInput.type = showing ? 'password' : 'text';
    pwToggle.classList.toggle('showing', !showing);
  });
}

// Prevent actual submission — no backend wired up yet
const form = document.getElementById('login-form');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });
}
