#!/bin/bash
set -e
npm install

# Run drizzle-kit's `db:push` with stdin closed (`</dev/null`). This makes
# drizzle-kit:
#   - succeed silently for schema changes that don't require any prompt
#     (adding new columns/tables, removing columns that were never populated,
#     etc.), so a routine merge applies trivial schema diffs automatically;
#   - FAIL fast if any change requires interactive confirmation (DROP COLUMN
#     of a populated column, DROP TABLE, ADD CONSTRAINT to a populated table,
#     TRUNCATE, rename disambiguation, etc.).
#
# We deliberately do NOT pipe `yes ""` or any auto-accept stream into the
# command. Encoding the assumption that drizzle-kit's prompt defaults are
# always safe is exactly the failure mode the r28/r29 reviews flagged: a
# future destructive prompt could be silently accepted. Instead, the merge
# completes and we surface a loud, actionable message so the operator can
# run `npm run db:push` manually from a TTY (or apply targeted SQL like
# `migrations/0008_drop_image_data.sql`) after reviewing each prompt.
if ! npm run db:push </dev/null; then
  echo ""
  echo "================================================================"
  echo "[post-merge] WARNING: 'npm run db:push' could not run unattended."
  echo "[post-merge] The schema diff requires interactive confirmation."
  echo "[post-merge] Run 'npm run db:push' manually from a terminal and"
  echo "[post-merge] review every prompt — destructive prompts (DROP COL,"
  echo "[post-merge] DROP TABLE) should typically be answered 'No' and"
  echo "[post-merge] applied via targeted SQL after a backfill / zero-row"
  echo "[post-merge] check (see migrations/0008_drop_image_data.sql for"
  echo "[post-merge] the established pattern)."
  echo "[post-merge] Schema is NOT yet synced. Post-merge continuing."
  echo "================================================================"
fi
