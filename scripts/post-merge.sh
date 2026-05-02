#!/bin/bash
set -e
npm install

# Pipe empty lines so `drizzle-kit push` interactive prompts auto-accept the
# default highlighted option. drizzle-kit follows a strict convention:
#   - destructive prompts (DROP COLUMN, DROP TABLE, TRUNCATE) default to "No"
#   - non-destructive prompts (ADD CONSTRAINT to populated table) default to
#     the operation that preserves data (e.g. "add without truncating")
# `yes ""` therefore selects the safe option for every prompt and prevents
# this hook from hanging in a non-TTY post-merge environment. Destructive
# changes that REQUIRE confirmation must be applied manually via SQL after
# review (see migrations/0008_drop_image_data.sql for the established pattern).
yes "" | npm run db:push
