const bcrypt = require('bcryptjs');

// Admin accounts can't be created through the site any more, so tests that
// need an extra admin put one straight into the database.
function addAdmin(db, { username, password, role, mustChangePassword }) {
  return db.createAdmin({ username, passwordHash: bcrypt.hashSync(password, 10), role, mustChangePassword });
}

module.exports = { addAdmin };