function stEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  // See voice.js's copy of this helper for why quotes need handling
  // separately from the &/</> the textContent/innerHTML round-trip covers.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stStatusClass(status) {
  if (status === 'At Risk') return 'status-at-risk';
  if (status === 'Complete') return 'status-complete';
  return 'status-on-track';
}

async function loadProjectsPage() {
  const res = await fetch('/api/projects');
  if (!res.ok) return;
  const { projects } = await res.json();

  const listEl = document.getElementById('projects-page-list');
  const emptyEl = document.getElementById('projects-page-empty');

  listEl.querySelectorAll('.project-page-card').forEach((el) => el.remove());
  emptyEl.hidden = projects.length > 0;

  projects.forEach((project) => {
    const percent = Math.max(0, Math.min(100, Number(project.percent) || 0));
    const status = project.status || 'On Track';
    const article = document.createElement('article');
    article.className = 'project-page-card';
    article.innerHTML = `
      <div class="project-page-head">
        <h3>${stEscapeHtml(project.title)}</h3>
        <span class="project-page-status ${stStatusClass(status)}">${stEscapeHtml(status)}</span>
      </div>
      ${project.lead ? `<p class="project-page-lead">${stEscapeHtml(project.lead)}</p>` : ''}
      ${project.description ? `<p class="project-page-desc">${stEscapeHtml(project.description)}</p>` : ''}
      <div class="project-page-progress-row">
        <span>Progress</span>
        <span>${percent}%</span>
      </div>
      <div class="project-page-track"><div class="project-page-fill" style="width: ${percent}%"></div></div>
    `;
    listEl.appendChild(article);
  });
}

loadProjectsPage();
