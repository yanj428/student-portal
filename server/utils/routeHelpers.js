// Route handlers shared by the admin-editable lists (quick links, community
// service resources and events, archived slides, calendar events). Each takes
// the list's own read/write functions, so the lists keep their own collections.

// GET: the whole list under `key`, each item through `publicFn`.
function listRoute(read, key, publicFn) {
  return (req, res) => res.json({ [key]: read().map(publicFn) });
}

// PUT .../reorder: `orderedIds` must be exactly the current ids, in the new order.
// Register it before the "/:id" routes so "reorder" is never read as an id.
function reorderRoute({ read, write, key, publicFn, noun }) {
  return (req, res) => {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'orderedIds must be an array of ids.' });
    }

    const items = read();
    const byId = new Map(items.map((item) => [item.id, item]));
    const sameSet = orderedIds.length === items.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => byId.has(id));
    if (!sameSet) return res.status(400).json({ error: `orderedIds must match the current ${noun} exactly.` });

    write(orderedIds.map((id) => byId.get(id)));
    res.json({ [key]: read().map(publicFn) });
  };
}

// DELETE .../:id, with a 404 when nothing has that id. `onRemoved(item)` runs
// afterwards (for example to delete an uploaded file).
function deleteRoute({ read, write, notFound, onRemoved }) {
  return (req, res) => {
    const items = read();
    const removed = items.find((item) => item.id === req.params.id);
    if (!removed) return res.status(404).json({ error: notFound });
    write(items.filter((item) => item.id !== req.params.id));
    if (onRemoved) onRemoved(removed);
    res.json({ ok: true });
  };
}

module.exports = { listRoute, reorderRoute, deleteRoute };