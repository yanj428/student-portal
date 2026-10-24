// Sidebar tab switching and the "today's date" header on the Overview page.

export function initNav() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pageSections = document.querySelectorAll('.admin-page-section[data-section]');
  const pageTitleEl = document.getElementById('page-title');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((n) => n.classList.toggle('active', n === item));
      pageSections.forEach((section) => {
        section.hidden = section.dataset.section !== item.dataset.page;
      });
      pageTitleEl.textContent = item.querySelector('span').textContent;
    });
  });

  document.getElementById('content-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}
