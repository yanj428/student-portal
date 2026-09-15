# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repo.

## What this is

A student portal for KPIS International School: Node/Express 5 backend,
EJS server-rendered pages, vanilla HTML/CSS/JS on the frontend (no build
step, no framework), SQLite (better-sqlite3) for storage. Two separate
login systems — students (email/password) and admins (username/password,
with roles and optional TOTP 2FA) — sharing one Express app and one
`kpis.sid` session cookie, backed by a SQLite-backed session store so
sessions survive a server restart.

This repo is **private** and contains a real school's real data (student
council members' names, real calendar events, etc.) via `server/seed/`.
Never assume it's safe to make public, and never copy that data elsewhere
without thinking about it first.

## Running it

```bash
npm install
npm run seed   # loads server/seed/content.json into a fresh local db (see below)
npm start      # http://localhost:8791
npm test       # node's built-in test runner + supertest, ~72 tests
```

`.env` (see `.env.example`) needs `ADMIN_PASSWORD` and `SESSION_SECRET` set
for anything beyond throwaway local testing; `GEMINI_API_KEY` is optional
and only powers "Extract events with AI" on the School Calendar admin page.

## Data model

Everything lives in one SQLite file (`data/portal.db`, gitignored).
Most admin-managed lists — clubs, announcements, calendar events, council,
projects, quick links, CS events, slide archive, Student Voice posts — are
generic JSON-blob rows via `jsonCollection()` in `server/db.js`, all
sharing one `collection_items` table keyed by collection name. Adding or
removing a field on one of these is just a JS object shape change — no
migration needed. Students and admins get real typed tables instead, since
those need actual SQL lookups (login by email, uniqueness, etc.).

### The content seed (`server/seed/`)

`server/seedWriter.js` automatically regenerates `server/seed/content.json`
(plus copies of any images those items reference) every time one of the
content collections above is written — but **only** during a normal local
dev run where `DATA_DIR` is unset. Both the test suite and any real
deployment set `DATA_DIR` explicitly, so this can never overwrite the
checked-in seed with test fixtures or clobber a live deployment's own data.
`npm run seed` loads that seed into a fresh database (skips any collection
that already has data — never overwrites real content). This is what lets
someone else clone the repo and see the same clubs/council/calendar/etc.
without ever needing the real `data/portal.db` file, which also holds
accounts, password hashes, sessions, and security logs that should never
be shared.

Never manually edit `server/seed/content.json` — it's generated. Run
`npm run seed:export` only if you need to force a re-sync by hand.

## Security patterns already in place — don't relax without a reason

- Every admin-editable URL field goes through `server/utils/validateUrl.js`,
  which rejects anything but `http(s)://` (blocks `javascript:` etc.). Quick
  Links is the one field that allows plain `http://`; everything else
  (club Instagram/application/signup links, CS event signup) is
  https-only. Extend via the `allowHttp` option, don't loosen the shared
  default.
- File uploads (`server/uploads.js`) are checked by real magic bytes
  (`detectImageType`), not by the claimed `Content-Type` or extension.
- Student and admin login are both rate-limited and have their own
  exponential-backoff lockout (`server/db.js`'s `recordFailedAttempt`).
  A nonexistent email locks out identically to a real one — don't add a
  code path that reveals whether an email exists.
- Reordering endpoints (council, quick links) use **Pointer Events**, never
  native HTML5 drag-and-drop. A native-draggable `<img>` dropped anywhere
  the app doesn't handle falls back to the browser navigating the whole
  tab to that file — this actually happened during development. If you add
  another reorderable list with images in the rows, follow the same
  pointer-events pattern (see `public/admin/council.js`), not
  `draggable="true"`.
- `PUT /:id`-style routes must be registered **before** any sibling
  `PUT /reorder`-style route on the same base path, or Express matches
  `:id` = `"reorder"` first. Bit twice already (council, then quick links).

## Testing

`tests/helpers/setup.js` gives every test file its own fresh temp
`DATA_DIR` — tests never share state with each other or with your local
`data/portal.db`. Run `npm test` after any server-side change. When adding
something that touches the content seed or `DATA_DIR` logic, verify by hand
that a test run doesn't touch `server/seed/content.json` (check its mtime
before/after) — that guarantee is easy to accidentally break.

## Conventions

- No dead code, no speculative abstraction, no comments that just restate
  the code. Comments exist to explain *why* (a past incident, a non-obvious
  constraint) — see the existing comments in `server/db.js` and
  `server/utils/validateUrl.js` for the house style.
- Client-side admin panels: one `public/admin/<feature>.js` module per
  panel, wired up from `public/admin/main.js`. Shared helpers
  (`escapeHtml`, `sendJSON`, `sendForm`, `del`) live in `public/admin/api.js`.
- Always run the full test suite before calling something done, and verify
  UI changes live (a throwaway test student/admin account, cleaned up
  after) rather than assuming a code read is enough.
- **Never** touch the real `test.student@kpis.ac.th` account's password or
  data when verifying something live — create and delete your own
  throwaway accounts/content instead.
- Static files under `public/` are served as-is (no build step) and take
  effect on the next page load. Anything under `server/` needs the dev
  server restarted to take effect.

## Known environment quirks

- Windows/PowerShell: an `&` character anywhere in a `git commit -m`
  message breaks PowerShell's argument parsing to `git.exe`. Assign the
  message to a variable via a here-string first, and avoid `&` in commit
  messages (write "and" instead).
- The Gemini flash models are inconsistently available/overloaded; the
  calendar AI extraction (`server/utils/calendarEventsAi.js`) already
  retries transient 503s automatically. If you change the model name,
  check it's actually reachable with a real request before assuming it
  works — several `gemini-*-flash` model names have turned out to be
  deprecated or 503 on first try.
