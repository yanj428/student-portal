// "Customize home page": an edit mode on the page itself. Every section gets a
// handle to drag it into a new place, a Hide / Show button and a Content button
// for what is inside it. Hidden sections stay on screen as small placeholders so
// they can be brought back. Saving stores the choice on the student's account
// and reloads the page, so the server draws it as chosen.

(function () {
  const main = document.getElementById('home-main');
  const openBtn = document.getElementById('home-customize-btn');
  const bar = document.getElementById('home-edit-bar');
  if (!main || !openBtn || !bar) return;

  const saveBtn = document.getElementById('home-edit-save');
  const cancelBtn = document.getElementById('home-edit-cancel');
  const resetBtn = document.getElementById('home-edit-reset');
  const errorEl = document.getElementById('home-edit-error');

  const widgets = () => [...main.querySelectorAll(':scope > .home-widget')];
  const siblingWidget = (el, dir) => {
    let n = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    while (n && !n.classList.contains('home-widget')) n = dir < 0 ? n.previousElementSibling : n.nextElementSibling;
    return n;
  };

  // What is inside each section, as currently saved (the server puts it on the
  // section) and as the student changes it here.
  const settings = {};
  let jumpTiles = [];
  let heroButtons = [];
  let heroButtonMax = 4;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  // ---- The options each section offers --------------------------------------
  const COUNT_OPTIONS = (values) => values.map((v) => ({ value: v, label: String(v) }));
  const SCHEMAS = {
    hero: () => [
      { type: 'check', key: 'showDate', label: "Show today's date" },
      { type: 'check', key: 'showButtons', label: 'Show the buttons' },
      { type: 'checks', key: 'buttons', label: 'Which buttons (up to ' + heroButtonMax + ')', options: heroButtons.map((b) => ({ value: b.id, label: b.title })), max: heroButtonMax },
      { type: 'check', key: 'showCrest', label: 'Show the school crest' },
    ],
    jump: () => [{ type: 'checks', key: 'tiles', label: 'Tiles to show', options: jumpTiles.map((t) => ({ value: t.id, label: t.title })) }],
    events: () => [
      { type: 'select', key: 'count', label: 'How many events', number: true, options: COUNT_OPTIONS([1, 2, 3, 4, 5, 6, 8, 10]) },
      { type: 'check', key: 'showSubtitle', label: "Show each event's details" },
    ],
    cards: () => [
      { type: 'check', key: 'lunch', label: "This week's lunch card" },
      { type: 'check', key: 'slide', label: "This week's slide card" },
    ],
    clubs: () => [
      { type: 'select', key: 'type', label: 'Which clubs', options: [{ value: 'all', label: 'All clubs' }, { value: 'community-service', label: 'Community service clubs' }, { value: 'after-school', label: 'After school clubs' }] },
      { type: 'select', key: 'count', label: 'How many to show', number: true, options: COUNT_OPTIONS([3, 4, 5, 6, 8, 10, 12]) },
      { type: 'check', key: 'showNames', label: 'Show club names' },
      { type: 'check', key: 'showMore', label: 'Show the "+ more clubs" circle' },
    ],
    service: () => [
      { type: 'select', key: 'count', label: 'How many posts', number: true, options: COUNT_OPTIONS([1, 2, 3, 4, 5]) },
      { type: 'check', key: 'showDescription', label: "Show each post's description" },
    ],
    links: () => [{ type: 'links', key: 'ids', label: 'Links to show' }],
  };

  function fieldHtml(widgetId, field) {
    const value = settings[widgetId][field.key];
    const name = `${widgetId}-${field.key}`;
    if (field.type === 'check') {
      return `<label class="home-edit-check"><input type="checkbox" data-key="${field.key}" ${value ? 'checked' : ''} /> ${escapeHtml(field.label)}</label>`;
    }
    if (field.type === 'select') {
      const opts = field.options
        .map((o) => `<option value="${escapeHtml(String(o.value))}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');
      return `<label class="home-edit-field" for="${name}"><span>${escapeHtml(field.label)}</span><select id="${name}" data-key="${field.key}" ${field.number ? 'data-number="1"' : ''}>${opts}</select></label>`;
    }
    // 'checks' (a set of tiles) and 'links' (the quick links, loaded when opened)
    return `<fieldset class="home-edit-set" data-key="${field.key}" data-kind="${field.type}"><legend>${escapeHtml(field.label)}</legend><div class="home-edit-set-items"></div></fieldset>`;
  }

  function fillSet(panel, widgetId, field, items) {
    const set = panel.querySelector(`[data-key="${field.key}"]`);
    const current = settings[widgetId][field.key];
    const chosen = (value) => (current === null ? true : current.includes(value));
    set.querySelector('.home-edit-set-items').innerHTML = items.length
      ? items.map((o) => `<label class="home-edit-check"><input type="checkbox" value="${escapeHtml(o.value)}" ${chosen(o.value) ? 'checked' : ''} /> ${escapeHtml(o.label)}</label>`).join('')
      : '<p class="home-edit-note">Nothing to choose from yet.</p>';
    set.querySelectorAll('input').forEach((box) => {
      box.addEventListener('change', () => {
        // A set with a limit (the banner's buttons) refuses a tick past it.
        if (field.max && set.querySelectorAll('input:checked').length > field.max) {
          box.checked = false;
          return;
        }
        const picked = [...set.querySelectorAll('input:checked')].map((b) => b.value);
        // Every link ticked means "all of them", so links added later still show.
        settings[widgetId][field.key] = field.type === 'links' && picked.length === items.length ? null : picked;
        schedulePreview(widgetId);
      });
    });
  }

  async function buildPanel(widget) {
    const widgetId = widget.dataset.widget;
    const fields = SCHEMAS[widgetId]();
    const panel = document.createElement('div');
    panel.className = 'home-edit-settings';
    panel.innerHTML = `<p class="home-edit-settings-title">What shows in ${escapeHtml(widget.dataset.title)}</p>` + fields.map((f) => fieldHtml(widgetId, f)).join('');

    panel.querySelectorAll('input[type="checkbox"][data-key]').forEach((box) => {
      box.addEventListener('change', () => {
        settings[widgetId][box.dataset.key] = box.checked;
        schedulePreview(widgetId);
      });
    });
    panel.querySelectorAll('select[data-key]').forEach((sel) => {
      sel.addEventListener('change', () => {
        settings[widgetId][sel.dataset.key] = sel.dataset.number ? Number(sel.value) : sel.value;
        schedulePreview(widgetId);
      });
    });

    for (const field of fields) {
      if (field.type === 'checks') fillSet(panel, widgetId, field, field.options);
      if (field.type === 'links') {
        const data = await fetchJson('/api/quick-links');
        fillSet(panel, widgetId, field, data ? data.quickLinks.map((q) => ({ value: q.id, label: q.label })) : []);
      }
    }
    return panel;
  }

  // ---- Controls on each section ---------------------------------------------
  function addControls(widget) {
    const controls = document.createElement('div');
    controls.className = 'home-edit-controls';
    controls.innerHTML = `
      <span class="home-edit-handle" title="Drag to move" aria-hidden="true">&#8942;&#8942;</span>
      <span class="home-edit-title">${escapeHtml(widget.dataset.title)}</span>
      <span class="home-edit-actions">
        <button type="button" class="home-edit-content" aria-expanded="false">Content</button>
        <button type="button" class="home-edit-move" data-dir="-1" aria-label="Move ${escapeHtml(widget.dataset.title)} up">&#9650;</button>
        <button type="button" class="home-edit-move" data-dir="1" aria-label="Move ${escapeHtml(widget.dataset.title)} down">&#9660;</button>
        <button type="button" class="home-edit-toggle"></button>
      </span>`;
    widget.prepend(controls);

    const toggle = controls.querySelector('.home-edit-toggle');
    const refreshToggle = () => {
      const hidden = widget.classList.contains('is-hidden');
      toggle.textContent = hidden ? 'Show' : 'Hide';
      toggle.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${widget.dataset.title}`);
    };
    refreshToggle();
    toggle.addEventListener('click', () => {
      widget.classList.toggle('is-hidden');
      refreshToggle();
    });

    const contentBtn = controls.querySelector('.home-edit-content');
    contentBtn.addEventListener('click', async () => {
      let panel = widget.querySelector(':scope > .home-edit-settings');
      if (!panel) {
        contentBtn.disabled = true;
        panel = await buildPanel(widget);
        contentBtn.disabled = false;
        controls.after(panel);
        contentBtn.setAttribute('aria-expanded', 'true');
        return;
      }
      panel.hidden = !panel.hidden;
      contentBtn.setAttribute('aria-expanded', String(!panel.hidden));
    });

    controls.querySelectorAll('.home-edit-move').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.dir);
        const other = siblingWidget(widget, dir);
        if (!other) return;
        if (dir < 0) other.before(widget);
        else other.after(widget);
        widget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        btn.focus();
      });
    });

    enableDrag(controls.querySelector('.home-edit-handle'), widget);
  }

  // Dragging is done with pointer events (no native drag-and-drop, which would
  // try to drag links and images instead). The section follows the pointer up
  // and down the page, and the page scrolls when the pointer nears an edge.
  function enableDrag(handle, widget) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      widget.classList.add('dragging');
      let pointerY = e.clientY;
      let scrolling = true;

      const reposition = () => {
        const others = widgets().filter((w) => w !== widget);
        if (others.length === 0) return;
        const before = others.find((w) => {
          const box = w.getBoundingClientRect();
          return pointerY < box.top + box.height / 2;
        });
        if (before) before.before(widget);
        else others[others.length - 1].after(widget);
      };

      const autoScroll = () => {
        if (!scrolling) return;
        if (pointerY < 90) window.scrollBy(0, -14);
        else if (pointerY > window.innerHeight - 90) window.scrollBy(0, 14);
        reposition();
        requestAnimationFrame(autoScroll);
      };

      const onMove = (moveEvent) => {
        pointerY = moveEvent.clientY;
        reposition();
      };
      const onUp = () => {
        scrolling = false;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        widget.classList.remove('dragging');
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      requestAnimationFrame(autoScroll);
    });
  }

  // ---- Dragging the items inside a section ----------------------------------
  // The tiles, cards, quick links and clubs inside a section can be dragged into
  // a new order. Each item carries data-item-id and sits directly inside its
  // section's data-sortable container. The item under the pointer swaps places
  // with the one it is dragged over, which works for rows and for wrapped grids.
  const itemsOf = (container) => [...container.querySelectorAll(':scope > [data-item-id]')];

  function enableItemDrag(container) {
    container.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const item = e.target.closest('[data-item-id]');
      if (!item || item.parentElement !== container || !main.classList.contains('home-editing')) return;
      e.preventDefault();
      item.classList.add('dragging-item');

      const onMove = (moveEvent) => {
        const others = itemsOf(container).filter((o) => o !== item);
        let nearest = null;
        let nearestDistance = Infinity;
        let center = null;
        others.forEach((other) => {
          const box = other.getBoundingClientRect();
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          const distance = Math.hypot(moveEvent.clientX - cx, moveEvent.clientY - cy);
          if (distance < nearestDistance) {
            nearest = other;
            nearestDistance = distance;
            center = { cx, cy, height: box.height };
          }
        });
        if (!nearest) return;
        // Same row: compare sideways. A different row: compare up and down.
        const sameRow = Math.abs(moveEvent.clientY - center.cy) < center.height / 2;
        const before = sameRow ? moveEvent.clientX < center.cx : moveEvent.clientY < center.cy;
        if (before && nearest.previousElementSibling !== item) nearest.before(item);
        else if (!before && nearest.nextElementSibling !== item) nearest.after(item);
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        item.classList.remove('dragging-item');
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  // While editing, clicking an item must not open the link it points to.
  main.addEventListener('click', (e) => {
    if (main.classList.contains('home-editing') && e.target.closest('[data-item-id]')) e.preventDefault();
  }, true);

  const containerFor = (name) => main.querySelector('[data-sortable="' + name + '"]');
  const idsIn = (name) => {
    const container = containerFor(name);
    return container ? itemsOf(container).map((el) => el.dataset.itemId) : [];
  };
  // The order as dragged, then anything that is not on screen right now (a hidden
  // tile, a link that is switched off) in the place it had before.
  const mergeOrder = (dragged, previous) => [...dragged, ...previous.filter((id) => !dragged.includes(id))];

  // Reads the dragged orders into the settings that are about to be saved.
  function collectItemOrders() {
    // Jump to tiles and the banner's buttons: the dragged order of the ones that
    // are chosen, then any newly chosen ones after them.
    const chosenInOrder = (name, chosen) => {
      const dragged = idsIn(name).filter((id) => chosen.includes(id));
      return [...dragged, ...chosen.filter((id) => !dragged.includes(id))];
    };
    settings.jump.tiles = chosenInOrder('jump', settings.jump.tiles);
    settings.hero.buttons = chosenInOrder('hero', settings.hero.buttons);
    settings.cards.order = mergeOrder(idsIn('cards'), settings.cards.order);
    settings.links.order = mergeOrder(idsIn('links'), settings.links.order);
    settings.clubs.order = mergeOrder(idsIn('clubs'), settings.clubs.order);
  }

  // ---- Live preview ----------------------------------------------------------
  // As soon as an option changes, the section is drawn again with it, so the
  // student sees what they are about to get. Nothing is saved until Save. The
  // server draws the section (the same way it draws the page), then the
  // section fills itself in again with refreshHomeWidget (see home.js).
  const previewTimers = {};
  const previewCounts = {};

  function schedulePreview(widgetId) {
    clearTimeout(previewTimers[widgetId]);
    previewTimers[widgetId] = setTimeout(() => preview(widgetId), 150);
  }

  async function preview(widgetId) {
    const widget = main.querySelector(':scope > .home-widget[data-widget="' + widgetId + '"]');
    if (!widget) return;
    collectItemOrders(); // keep any dragged order through the redraw
    previewCounts[widgetId] = (previewCounts[widgetId] || 0) + 1;
    const mine = previewCounts[widgetId];
    try {
      const res = await fetch('/api/home-layout/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widget: widgetId, settings: settings[widgetId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (mine !== previewCounts[widgetId]) return; // a newer change is already on its way
      if (!res.ok) {
        showError(data.error || 'Could not preview that.');
        return;
      }
      showError('');
      [...widget.children].forEach((child) => {
        if (!child.classList.contains('home-edit-controls') && !child.classList.contains('home-edit-settings')) child.remove();
      });
      widget.insertAdjacentHTML('beforeend', data.html);
      widget.dataset.settings = JSON.stringify(data.settings);
      widget.querySelectorAll('[data-sortable]').forEach(enableItemDrag);
      refreshHomeWidget(widgetId);
    } catch {
      showError('Could not reach the server to preview that.');
    }
  }

  async function startEditing() {
    openBtn.disabled = true;
    const data = await fetchJson('/api/home-layout');
    openBtn.disabled = false;
    if (!data) return;
    jumpTiles = data.jumpTiles;
    heroButtons = data.heroButtons;
    heroButtonMax = data.heroButtonMax;
    Object.assign(settings, JSON.parse(JSON.stringify(data.layout.settings)));

    widgets().forEach(addControls);
    main.querySelectorAll('[data-sortable]').forEach(enableItemDrag);
    main.classList.add('home-editing');
    bar.hidden = false;
    bar.scrollIntoView({ block: 'nearest' });
  }

  async function send(method, body) {
    showError('');
    saveBtn.disabled = true;
    resetBtn.disabled = true;
    try {
      const res = await fetch('/api/home-layout', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || 'Could not save. Please try again.');
        saveBtn.disabled = false;
        resetBtn.disabled = false;
        return;
      }
      window.location.reload();
    } catch {
      showError('Could not reach the server. Please try again.');
      saveBtn.disabled = false;
      resetBtn.disabled = false;
    }
  }

  openBtn.addEventListener('click', startEditing);
  // Nothing was saved, so leaving edit mode is just loading the page again.
  cancelBtn.addEventListener('click', () => window.location.reload());
  saveBtn.addEventListener('click', () => {
    collectItemOrders();
    const all = widgets();
    send('PUT', {
      order: all.map((w) => w.dataset.widget),
      hidden: all.filter((w) => w.classList.contains('is-hidden')).map((w) => w.dataset.widget),
      settings,
    });
  });
  resetBtn.addEventListener('click', () => {
    if (!confirm('Put your home page back to the standard layout and content?')) return;
    send('DELETE');
  });
})();
