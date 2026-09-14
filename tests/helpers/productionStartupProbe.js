// Just requiring config.js is enough to trigger its production safety
// check — it throws synchronously if NODE_ENV=production and either
// secret is missing or still the well-known insecure default.
require('../../server/config');
process.exit(0);
