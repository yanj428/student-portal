// Sidebar tab switching and the "today's date" header on the Overview page.

export function initNav() {
  const pageTitles = {
    overview: 'Overview',
    students: 'Student Accounts',
    lunch: 'Lunch Schedule',
    archive: 'Announcements',
    calendar: 'School Calendar',
    clubs: 'Clubs',
    community: 'Community Service',
    council: 'Council',
    projects: 'StuCo Projects',
    quicklinks: 'Quick Links',
    voice: 'Student Voice',
    security: 'Security',
    account: 'My Account',
  };

  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pageSections = document.querySelectorAll('.admin-page-section[data-section]');
  const pageTitleEl = document.getElementById('page-title');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;

      navItems.forEach((n) => n.classList.toggle('active', n === item));
      pageSections.forEach((section) => {
        section.hidden = section.dataset.section !== page;
      });
      pageTitleEl.textContent = pageTitles[page] || 'Overview';
    });
  });

  const contentDateEl = document.getElementById('content-date');
  if (contentDateEl) {
    contentDateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  }
}
