#!/bin/sh
# Start command on Fly.io. The first time the app starts against an empty
# volume there is no database yet, so load the content seed (clubs, council,
# calendar, quick links and their images) before starting. Only on that first
# start: re-running the seed later could bring back content an admin deleted.
set -e

if [ ! -f "$DATA_DIR/portal.db" ]; then
  echo "No database on the volume yet: loading the content seed."
  node scripts/seedImport.js
fi

exec node server/server.js
