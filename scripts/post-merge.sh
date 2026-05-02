#!/bin/bash
set -e
npm install
# Pipe empty lines so drizzle-kit's interactive prompts auto-accept the
# default highlighted (non-destructive) option. Prevents post-merge from
# hanging when adding constraints to tables that already contain data.
yes "" | npm run db:push
