# AGENTS.md — Standing rules for AI agents working on this project

> **READ THIS FIRST. These rules apply to every change, fix, or feature — no
> matter how small.**

---

## The BUILD_STATUS.md update rule (mandatory)

**A task is NOT considered complete until `BUILD_STATUS.md` has been updated.**

This applies to every change you make: bug fixes, one-line tweaks, dependency
bumps, refactors, new features, deletions, configuration edits — everything.
If you finished work on the codebase but did not update `BUILD_STATUS.md`, the
task is unfinished. Do not call `mark_task_complete`. Do not commit. Do not
hand back to the user. Update the file first.

`BUILD_STATUS.md` is the single source of truth for the project. An outside
developer (or another AI agent) coming into this repo cold should be able to
read it and immediately understand the current state: what exists, what
works, what's broken, and what changed recently. Stale `BUILD_STATUS.md` =
broken project memory = wasted time on the next task.

---

## What you MUST update on every task

### 1. Prepend a new changelog entry (Section 10)

`BUILD_STATUS.md` Section 10 is reverse-chronological. The newest entry goes
at the **top** of the section, immediately under the `## 10. Changelog` header
(and above the previous most-recent entry). Use the next available revision
number (`r29`, `r30`, `r31`, …; sub-revisions `r30-a`, `r30-b` are fine for
related back-to-back work the same day).

Every entry must include:

- **Date and time** — `YYYY-MM-DD HH:MM` in the heading line.
- **One-line summary** in the heading itself (what changed at a glance).
- **What changed** — concrete description of the modification, not vague
  "improved X" wording. If you added a function, name it. If you changed a
  prompt default, quote the before and after. If you bumped a dependency,
  give the old and new versions.
- **Why** — the motivation. Bug fix? Reviewer rejection? User request?
  Security advisory? Refactor for clarity? Make this explicit so future
  readers understand the intent, not just the diff.
- **Files affected** — every file touched, listed by path. Include
  documentation files (this file, BUILD_STATUS.md itself), config files,
  and any one-off SQL or shell commands run against dev/prod databases.

Template:

```markdown
### r{N} — YYYY-MM-DD HH:MM — One-line summary

**What changed:** Concrete description with names, versions, line refs.

**Why:** The motivating reason — bug, request, advisory, refactor, etc.

**Files affected:** `path/to/file.ts`, `other/file.ts`, `BUILD_STATUS.md`.
```

### 2. Update the Feature Status table (Section 8) if anything changed state

Section 8 tracks every user-facing capability with a status column. If your
change moved a feature between states, update the row:

- ❌ Not started → 🚧 In progress → ✅ Done → ❌ Removed
- A previously ✅ Done feature that you broke must be marked back to 🚧 or
  flagged in the Notes column with a Known Issues §9 cross-reference.

If you added a brand-new feature, add a new row in the appropriate
sub-section. If you removed a feature, mark it ❌ Removed and put the
revision number in the Notes column.

If your change does not affect any feature's status, you can skip this
update — but err on the side of updating. A status note like "performance
improved in r{N}" or "validation rules tightened in r{N}" is still
valuable.

### 3. Update Known Issues (Section 9) if anything was fixed or newly introduced

Section 9 lists open bugs and quirks. Every task interacts with it in one
of three ways:

- **You fixed a known issue.** Mark its bullet `[RESOLVED]` (or
  `[PARTIALLY RESOLVED]` if some aspect remains) and append a short note
  about how/when it was fixed, citing the revision number. Do not delete
  resolved entries — they're historically valuable for the same bug
  recurring later.
- **You introduced a new known issue.** Add a new bullet at the top of
  Section 9 with a `[LOW]` / `[MEDIUM]` / `[HIGH]` severity tag, a clear
  description of the symptom, and the revision number that introduced it.
- **You did neither.** Section 9 is unchanged.

### 4. Update the Last Updated timestamp at the top

The header block of `BUILD_STATUS.md` carries a `**Last Updated:**` line.
Bump it to the current `YYYY-MM-DD HH:MM` on every change. This is the
fastest signal an outside reader has that the document is fresh.

### 5. Refresh the schema/storage/routes/pricing extraction line if applicable

The header block also lists which source files BUILD_STATUS was extracted
from, with their line counts. If your change touched `shared/schema.ts`,
`server/routes.ts`, `server/storage.ts`, or `server/services/pricingEngine.ts`
in a way that altered the line count meaningfully (added a table, removed
a route, etc.), refresh the count.

---

## Process checklist (run through this before calling `mark_task_complete`)

1. ☐ Code change is implemented and the workflow restarted cleanly.
2. ☐ `BUILD_STATUS.md` Section 10 has a new entry at the top with date/time,
   what, why, and files affected.
3. ☐ `BUILD_STATUS.md` Section 8 (Feature Status) updated if any feature
   moved state.
4. ☐ `BUILD_STATUS.md` Section 9 (Known Issues) updated for any bug fixed
   or newly introduced.
5. ☐ `BUILD_STATUS.md` `**Last Updated:**` timestamp at the top is current.
6. ☐ `.local/.commit_message` written, summarizing the change.
7. ☐ Code review run via the `code_review` skill (architect mode).

If any box is unchecked, the task is not done.

---

## Why this rule exists

Earlier work on this project drifted because changelog entries were skipped
on "small" changes — a security patch here, a config tweak there, a
post-merge script update. Months later it was unclear which version of which
dependency was running, why an option had been chosen, or whether a known
issue was still open. `BUILD_STATUS.md` is the only memory the project
itself has between AI sessions; if you don't write to it, the next agent
will repeat your work, miss your context, or undo your fix. **Update it
every time. No exceptions.**
