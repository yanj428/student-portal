// Sidebar navigation (visual state only — pages beyond Dashboard are not built yet)
document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    if (item.classList.contains('logout')) return;
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
