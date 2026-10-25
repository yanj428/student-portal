const express = require('express');

const db = require('../db');
const { requireOwnerAdmin } = require('../middleware/auth');

const router = express.Router();

// ---- Admin account management (owner only) ----
// Listing, changing a role and removing admins. New admin accounts are
// deliberately not creatable through the site: the first admin is made at
// startup from the ADMIN_PASSWORD setting.

router.get('/api/admin/admins', requireOwnerAdmin, (req, res) => {
  res.json({ admins: db.listAdmins() });
});


router.patch('/api/admin/admins/:id/role', requireOwnerAdmin, (req, res) => {
  const { role } = req.body || {};
  if (role !== 'owner' && role !== 'editor') return res.status(400).json({ error: 'Role must be "owner" or "editor".' });

  const admin = db.findAdminById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });

  if (admin.role === 'owner' && role === 'editor' && db.ownerCount() <= 1) {
    return res.status(400).json({ error: 'At least one owner admin must remain.' });
  }

  db.updateAdminRole(admin.id, role);
  db.logAuditEvent(req.session.adminUsername, 'admin.role_change', { username: admin.username, role });
  res.json({ ok: true });
});

router.delete('/api/admin/admins/:id', requireOwnerAdmin, (req, res) => {
  if (req.params.id === req.session.adminId) {
    return res.status(400).json({ error: "You can't remove your own admin account while logged in as it." });
  }
  if (db.adminCount() <= 1) {
    return res.status(400).json({ error: 'At least one admin account must remain.' });
  }
  const admin = db.findAdminById(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  if (admin.role === 'owner' && db.ownerCount() <= 1) {
    return res.status(400).json({ error: 'At least one owner admin must remain.' });
  }
  db.deleteAdmin(req.params.id);

  // Without this, a deleted admin's existing session would keep working
  // until requireAdmin's next per-request existence check catches it — this
  // ends it immediately instead of leaving that window open at all.
  db.destroyAdminSessions(admin.id);
  db.logAuditEvent(req.session.adminUsername, 'admin.delete', { deletedUsername: admin.username });
  res.json({ ok: true });
});

module.exports = router;
