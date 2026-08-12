---
name: tlc-create-pr
description: Closes out a TLC roadmap feature by syncing ROADMAP, merging main, running local CI when configured (fix-and-log failures to tmp/), opening a GitHub PR only when CI is green, then checking out the next m{N}/feature-slug branch. Use when the user says "create a PR", "open a PR", "open pr for this", "ship this feature", "PR this", "pr it", or "finish with a PR" on a repo that uses .specs/project/ROADMAP.md and TLC branch naming. Do NOT use for reviewing PRs (use pr-review), addressing review comments, fixing CI on an existing PR, or commits that are not meant to open a pull request.
license: CC-BY-4.0
metadata:
  author: Artur Webber
  version: 1.2.0
---

# TLC Create PR

Sequential handoff after `tlc-spec-driven` Execute: keep ROADMAP honest, prove local CI green (when configured), open the PR, land on the next roadmap branch. Does not replace Specify/Design/Tasks/Execute or the Verifier.

Ships with the `opencode-tlc-spec-driven` plugin (branch conventions come from `.opencode/tlc.jsonc` + the `tlc-branching` skill, not AGENTS.md).

## Neighbor skills

| Skill | Relationship |
| --- | --- |
| `tlc-spec-driven` | Feature work and Verifier belong there. This skill only ships and hands off. |
| `tlc-branching` | Owns the `m{N}/{feature-slug}` conventions and `tlc_branch` tool — use it to generate/validate branch names in steps 0 and 6. |
| `pr-review` | Reviews an existing PR — opposite direction. |
| Project `AGENTS.md` | Still authoritative for project gates (e.g. Playwright UAT). Branch naming moved to `.opencode/tlc.jsonc`. |

## Critical rules

1. Run only when the user asked to create/open/ship a PR.
2. Read `AGENTS.md` and `.specs/project/ROADMAP.md` before any git mutation.
3. Do not mark a feature COMPLETE/DONE in ROADMAP if TLC gates are still missing (UI → automated gates + Playwright UAT per AGENTS.md).
4. Never force-push to `main`, never skip hooks, never commit secrets.
5. Never push or `gh pr create` until local CI (`createPr.ci`) exits 0 — or until the gate has been confirmed skipped (not configured).
6. Never stage or commit `tmp/ci-failure-log.md` (or any other CI failure log under `tmp/`).

## Workflow

Track this checklist:

```
TLC Create PR:
- [ ] 0. Identify feature + gate check
- [ ] 1. Sync ROADMAP (+ STATE handoff)
- [ ] 2. Commit pending work for this PR
- [ ] 3. Merge origin/main into current branch
- [ ] 4. Local CI gate (if configured)
- [ ] 5. Push + create PR
- [ ] 6. Checkout next roadmap branch
```

### 0. Identify feature + gate check

Validation: know the feature slug and that completion claims are honest.

1. Resolve feature from branch name (`m{N}/{slug}` — validate via the `tlc_branch` tool), `.specs/features/<slug>/`, and STATE handoff.
2. If the user (or you) would mark it Complete and the surface is browser UI: confirm Verifier/Playwright evidence exists (e.g. `validation.md`). If missing → **stop**, list what’s missing, do not open a “done” PR.

On failure: stop and report. Do not merge or push yet.

### 1. Sync ROADMAP (+ STATE)

Depends on: step 0 passed.

Update `.specs/project/ROADMAP.md` when status is stale: mark the feature COMPLETE/DONE in the project’s existing vocabulary; refresh milestone Current/Status when the milestone boundary moves. Do not invent milestones or rewrite unrelated sections.

If `.specs/STATE.md` has Handoff, refresh what shipped and the proposed next feature (PR URL can be filled after step 5).

### 2. Commit pending work for this PR

Depends on: step 1 done (or skipped as a no-op).

1. `git status` / `git diff` / recent `git log`.
2. Stage and commit everything that belongs to this feature PR, including ROADMAP/STATE updates from step 1. Follow the user’s git commit protocol (HEREDOC message; no `-i`; no amend unless their amend rules allow).
3. If the worktree has clearly unrelated or sensitive files (other features, `.env`, credentials) → **ask** what to include; do not silently commit them.
4. Prefer atomic messages, e.g. feature commit(s) already present plus `docs(roadmap): mark <feature> complete` when only docs changed in this step.

If the branch is already clean and ROADMAP was already accurate → continue with no commit.

### 3. Merge `origin/main`

Depends on: step 2 complete (clean commit state for the PR).

```bash
git fetch origin
git merge origin/main
```

On conflicts: resolve and commit the merge. Never resolve by discarding the feature’s intent blindly. Local CI in step 4 covers re-validation after a conflicted merge.

On failure you cannot resolve → stop; leave the branch as-is and report.

### 4. Local CI gate (if configured)

Depends on: merge succeeded (or was a no-op fast-forward / already up to date).

Goal: when a local CI command is configured, the branch that will be pushed must pass it (GitHub CI parity).

1. Read `createPr.ci` from `.opencode/tlc.jsonc` (default: empty).
2. If `createPr.ci` is absent or empty → **skip the local CI gate**. Do not invent a CI command; proceed to step 5.
3. If configured, run it as-is (e.g. `mise exec -- bin/ci` if that is what the config says).

4. **On success (exit 0):** proceed to step 5. Do not create or update the failure log.

5. **On failure:** do not push or open a PR. Enter the fix loop:

   a. **Document** — append one entry to `tmp/ci-failure-log.md` (create the file if missing). Never stage this file. Use this shape:

   ```markdown
   ## YYYY-MM-DD HH:MM — branch `m{N}/{slug}` — FAIL

   - Step: <CI step name from the CI output, e.g. "Style" / "Tests">
   - Summary: <one-line cause>
   - Excerpt:
     ```
     <short relevant stderr/stdout; truncate aggressively>
     ```
   - Fix applied: <what you changed, or "blocked — needs human">
   ```

   b. **Fix** — address the failure surgically (lint, security finding, failing test, etc.). Commit the fix with a focused message (e.g. `fix: make CI happy before PR`).

   c. **Re-run** — run `createPr.ci` again.

   d. Repeat a–c until exit 0, or until blocked (unclear root cause, needs product decision, flaky infra). If blocked → stop, report the failure and point the user at `tmp/ci-failure-log.md`. Leave commits local; no push/PR.

Why the log stays uncommitted: it is a personal pattern ledger for recurring CI pain (candidates for better linters/formatters/automation), not part of the feature PR. `tmp/` is gitignored; still never force-add it.

### 5. Push + create PR

Depends on: step 4 succeeded (CI green or skipped).

Follow the user’s creating-pull-requests protocol: status/diff/log/`git diff origin/main...HEAD`, push `-u` if needed, then `gh pr create` with HEREDOC:

```markdown
## Summary
- <1–3 bullets: why this ships>

## Test plan
- [ ] Local CI passed (or skipped — not configured)
- [ ] <gates / manual checks from the feature>
```

Base: default branch (`main` unless the repo uses another). Return the PR URL. Optionally paste the URL into STATE handoff and amend only if the user’s amend rules allow; otherwise a tiny follow-up commit is fine if they want STATE updated — default is leave STATE with “PR opened” noted in the chat if already committed.

### 6. Checkout next roadmap branch

Depends on: PR URL returned.

1. Propose next work from ROADMAP (+ STATE): first PLANNED/ASAP/incomplete item in milestone order; slug from `.specs/features/<slug>/` when present; branch `m{N}/{feature-slug}` generated via the `tlc_branch` tool (conventions in `.opencode/tlc.jsonc`).
2. If two+ ASAP items or unclear → ask before checkout.
3. When clear or confirmed:

```bash
git checkout main
git pull origin main
git checkout -b m{N}/{feature-slug}
```

4. Tell the user: PR URL, new branch, next TLC step (usually Specify). Mention `tmp/ci-failure-log.md` only if entries were appended this run (so the user can skim for automation opportunities).

Branch from updated `main`, not from the just-pushed feature branch (`tlc-branching` convention: one feature per branch). The PR may still be unmerged — that is expected.

## Examples

### Example 1: Happy path

User says: "create a PR"

Actions: Confirm branch `m3/agent-voice`; ROADMAP still says PLANNED → mark COMPLETE; commit docs; merge `origin/main`; local CI (`createPr.ci`) green; push; `gh pr create`; propose `m3/dynamic-prompt-suggestions`; checkout that branch from `main`.

Result: PR URL + on `m3/dynamic-prompt-suggestions` ready for Specify.

### Example 2: CI fails then fixed

User says: "ship this feature"

Actions: Steps 0–3 OK; `createPr.ci` fails on `Style`. Append entry to `tmp/ci-failure-log.md`; fix offenses; commit `fix: CI before PR`; re-run `createPr.ci` green; push + create PR. Leave the log uncommitted.

Result: Green PR; user can later read `tmp/ci-failure-log.md` for recurring lint pain.

### Example 3: Gates missing

User says: "ship this feature" on a Hotwire UI branch with no Playwright UAT in `validation.md`.

Actions: Stop after step 0. List missing UAT. Do not mark COMPLETE, do not open a done PR.

Result: User runs TLC validate / Playwright first.

### Example 4: Dirty unrelated files

User says: "open a PR" with feature files plus an unrelated `.env` edit.

Actions: Sync ROADMAP; ask whether to include `.env` (refuse secrets); commit feature + docs only; merge; CI (if configured); continue PR/next branch.

Result: Clean PR without secrets.

## Troubleshooting

### Error: Verifier or Playwright UAT missing

Cause: AGENTS.md requires those gates before Complete for UI. Solution: Hand back to `tlc-spec-driven` validate; re-run this skill after evidence exists. Draft PR only if the user explicitly wants a WIP PR — then do not mark COMPLETE. WIP still should not skip step 4 unless the user explicitly waives local CI.

### Error: local CI failing

Cause: Lint, security audit, or tests. Solution: Append to `tmp/ci-failure-log.md`, fix, commit, re-run. Do not push red. If blocked after a reasonable fix attempt, stop and hand the log path to the user.

### Error: merge conflicts with origin/main

Cause: main moved. Solution: Resolve carefully; commit merge; let step 4 prove green. If blocked, stop and report conflicted paths — do not force-push.

### Error: gh auth or push rejected

Cause: Missing credentials or branch protection. Solution: Stop after explaining; leave commits local; do not invent alternate remotes.

### Error: no next roadmap item

Cause: ROADMAP has only IDEAS/research or empty queue. Solution: Open the PR anyway (after green CI, or with CI skipped); ask the user for the next branch or stop after PR URL.

## Out of scope

- Implementing the next feature (`tlc-spec-driven`)
- Merging the GitHub PR
- Reviewing the PR (`pr-review`)
- Force-push, hook skips, or rewriting shared history
- Committing CI failure logs under `tmp/`
