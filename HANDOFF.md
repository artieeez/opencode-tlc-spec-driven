# Handoff — opencode-tlc-spec-driven

Status: **prototype, unshipped**. Built across a discovery session; all decisions below are locked unless noted.

## What this is

An opencode plugin centered on [tlc-spec-driven](https://github.com/arturwebber/skills) workflows, with companion skills. Started as "rename the opencode session to the git branch" and grew into a small ecosystem: branch conventions + tools + session rename + worktree scaffold + the ported `tlc-create-pr` skill.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Editor scope | opencode only (no Cursor) |
| DB access | Never touch sqlite directly — rename via `client.session.update()` (official API) |
| Conventions source | `.opencode/tlc.jsonc` is canonical (parameters only). **Branch conventions removed from AGENTS.md**; the how-to lives in the `tlc-branching` skill |
| Distribution | npm plugin (`opencode plugin opencode-tlc-spec-driven`). Default install = project config; `--global` for global |
| Skill delivery | Companion skills ship in `skill/`, installed by `postinstall` (`scripts/install-skill.cjs`) → `~/.agents/skills/` (override `TLC_SKILL_DIR`) |
| Scoping | `rename.scope: "skill-gated"` — rename fires only after the `skill` tool loads a listed skill in that session (`SessionGate`) |
| Worktree | Explicit `tlc_worktree` tool (no auto-spawn), sibling directory, session fork |
| Naming | Skill proposes slug from spec; `tlc_branch` tool assembles + validates `m{N}/{feature-slug}` |
| `tlc-create-pr` | Migrated from the skills repo → now `skill/tlc-create-pr/` (AGENTS.md branch-naming references replaced) |

## Architecture / files

- `src/index.ts` — plugin entry; registers `tlc_branch` + `tlc_worktree` tools, `tool.execute.after` rename hook
- `src/config.ts` — loads `.opencode/tlc.jsonc` (zod + jsonc-parser), auto-creates with defaults
- `src/branch.ts` — branch name generate/validate + `parseBranchCommand`
- `src/rename.ts` — `SessionGate` (skill-gated scoping) + `renameHook`
- `src/git.ts` — `Bun.spawn(["git", ...])` helpers (no shell interpolation), Result types
- `src/worktree.ts` — scaffold: `ensureWorktree` (create + fork)
- `src/types.ts` — `OpencodeClient = ReturnType<typeof createOpencodeClient>`
- `skill/tlc-branching/SKILL.md` — branch conventions + worktree how-to (replaces AGENTS.md section)
- `skill/tlc-create-pr/` — ported PR-closing workflow + `references/mermaid-roadmap.md`
- `scripts/install-skill.cjs` — postinstall; replaces stale copies of both skills
- `test/branch.test.ts` — 9 tests, green

## Key facts (verified)

- Hook `tool.execute.after` receives `{ tool, sessionID, callID, args }`; `client.session.update({ path: { id }, body: { title } })` renames live (TUI + desktop, same server/DB).
- `vcs.branch.updated` event has **no sessionID** → rename must hook the bash tool call, not the event.
- Plugin context gives `{ client, directory, worktree, project, $ }`. Custom tool ctx gives `sessionID`, `directory`, `worktree`.
- `opencode plugin <pkg>` → project config by default; `--global` for global.
- Patterns studied: opencode-worktree (tools, jsonc config, git safety, session.fork), opencode-conductor (config hook for slash commands), opencode-zellij-namer (AGENTS.md parsing — rejected in favor of JSONC).

## Open work (next)

1. **Publish & install** — no remote yet, not pushed, not on npm. Steps: `git remote add origin …`, push, `npm publish`, then `opencode plugin opencode-tlc-spec-driven` in a real tlc project.
2. **Strip AGENTS.md conventions in real projects** — delete the branching section; point at `tlc-branching`. (tlc-create-pr no longer cites AGENTS.md for naming.)
3. **Validate skill-gating live** — confirm rename only fires after a tlc skill loads.
4. **Finish worktree** — `ensureWorktree` is a scaffold. Remaining: terminal launch into the worktree (desktop/TUI), session-fork→terminal handoff, cleanup on session end (mirror opencode-worktree's `session.idle` + pending-delete pattern).
5. Consider `config` hook slash commands (`/tlc:…`) like opencode-conductor — deferred.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # dist/
node scripts/install-skill.cjs   # installs skills to ~/.agents/skills/
```

## Where else things live

- Presentation/deck (decisions + rationale): `/Users/arturwebber/Documents/skills/tlc-plugin-plan.html` (committed to the skills repo).
- Skills repo: `/Users/arturwebber/Documents/skills` — tlc-create-pr removed; README updated.
