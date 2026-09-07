const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const submitBtn = document.getElementById('submit-btn');
const form = document.getElementById('login-form');

// "Forgot password?" has no reset flow — point students at Student Council instead
const forgotLink = document.getElementById('forgot-link');
const forgotNote = document.getElementById('forgot-note');
if (forgotLink && forgotNote) {
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    forgotNote.hidden = !forgotNote.hidden;
  });
}

// Show/hide password
const pwToggle = document.querySelector('.toggle-pw');
if (passwordInput && pwToggle) {
  pwToggle.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    pwToggle.classList.toggle('showing', !showing);
  });
}

function clearError() {
  loginError.hidden = true;
  emailInput.classList.remove('invalid');
  passwordInput.classList.remove('invalid');
}

function showError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
  emailInput.classList.add('invalid');
  passwordInput.classList.add('invalid');
}

[emailInput, passwordInput].forEach((el) => el.addEventListener('input', clearError));

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Incorrect email or password.');
        return;
      }

      window.location.href = 'index.html';
    } catch {
      showError('Could not reach the server. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  });
}
