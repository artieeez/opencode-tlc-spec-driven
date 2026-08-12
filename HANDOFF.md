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
| Skill delivery | Companion skills ship in `skill/` in the npm package. **Installed via `npx skills`** (vercel-labs ecosystem) — no `postinstall` (opencode installs plugins with `ignoreScripts`, so auto-install is unreliable). `npx skills add artieeez/opencode-tlc-spec-driven -s '*'` → project; add `-g -y -a opencode` → global (`~/.agents/skills/`) |
| Scoping | `rename.scope: "skill-gated"` — rename fires only after the `skill` tool loads a listed skill in that session (`SessionGate`) |
| Worktree | Explicit `tlc_worktree` tool (no auto-spawn), sibling directory, session fork |
| Naming | Skill proposes slug from spec; `tlc_branch` tool assembles + validates `m{N}/{feature-slug}` |
| `tlc-create-pr` | Migrated from the skills repo → now `skill/tlc-create-pr/` (AGENTS.md branch-naming references replaced) |

## Architecture / files

- `src/index.ts` — plugin entry; registers `tlc_branch` + `tlc_worktree` + `tlc_worktree_delete` tools, `tool.execute.after` rename hook, `event` hook (`session.idle`/`session.deleted` cleanup)
- `src/config.ts` — loads `.opencode/tlc.jsonc` (zod + jsonc-parser), auto-creates with defaults
- `src/branch.ts` — branch name generate/validate + `parseBranchCommand`
- `src/rename.ts` — `SessionGate` (skill-gated scoping) + `renameHook`
- `src/git.ts` — `Bun.spawn(["git", ...])` helpers (no shell interpolation), Result types, `createWorktree`/`removeWorktree`/`getProjectId`/sibling path resolution
- `src/terminal.ts` — terminal launch (tmux/macOS/Linux/Windows), self-deleting temp scripts, escaping
- `src/state.ts` — persistent session→worktree + pending-delete store (JSON, atomic writes), keyed by shared project ID
- `src/worktree.ts` — `openWorktree` (create + fork + terminal handoff), `requestWorktreeDelete`, `handleSessionIdle`/`handleSessionDeleted` (pending-delete cleanup)
- `src/types.ts` — `OpencodeClient = ReturnType<typeof createOpencodeClient>`
- `skill/tlc-branching/SKILL.md` — branch conventions + worktree how-to (replaces AGENTS.md section)
- `skill/tlc-create-pr/` — ported PR-closing workflow + `references/mermaid-roadmap.md`
- `test/branch.test.ts` — 9 tests, green
- `test/worktree.test.ts` — 16 tests (paths, escaping, terminal detection, state store), green

## Key facts (verified)

- Hook `tool.execute.after` receives `{ tool, sessionID, callID, args }`; `client.session.update({ path: { id }, body: { title } })` renames live (TUI + desktop, same server/DB).
- `vcs.branch.updated` event has **no sessionID** → rename must hook the bash tool call, not the event.
- Plugin context gives `{ client, directory, worktree, project, $ }`. Custom tool ctx gives `sessionID`, `directory`, `worktree`.
- `opencode plugin <pkg>` → project config by default; `--global` for global.
- Patterns studied: opencode-worktree (tools, jsonc config, git safety, session.fork), opencode-conductor (config hook for slash commands), opencode-zellij-namer (AGENTS.md parsing — rejected in favor of JSONC).

## Open work (next)

1. **Publish & install** — remote exists (`artieeez/opencode-tlc-spec-driven`, pushed). Not on npm yet: `npm publish`, then `opencode plugin opencode-tlc-spec-driven` in a real tlc project + `npx skills` for the companion skills.
2. **Strip AGENTS.md conventions in real projects** — delete the branching section; point at `tlc-branching`. (tlc-create-pr no longer cites AGENTS.md for naming.)
3. **Validate skill-gating live** — confirm rename only fires after a tlc skill loads.
4. **Worktree — DONE (prototype)** — `openWorktree` creates the worktree as a sibling of the repo, forks the session into it (`session.fork` with `query.directory`), launches a terminal via `worktree.launchCommand --session <forkedId>`, and records the mapping in `src/state.ts`. Cleanup mirrors opencode-worktree's `session.idle` + pending-delete: `tlc_worktree_delete` marks pending, `handleSessionIdle` commits + removes the worktree when the forked session ends. Not yet tested live in a terminal (needs a real opencode run); pure logic is unit-tested.
5. Consider `config` hook slash commands (`/tlc:…`) like opencode-conductor — deferred.

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # dist/
```

Skill install (postinstall was removed — opencode installs plugins with `ignoreScripts`):

```bash
npx skills add artieeez/opencode-tlc-spec-driven -s '*' -y                 # project → .agents/skills/
npx skills add artieeez/opencode-tlc-spec-driven -s '*' -g -y -a opencode  # global  → ~/.agents/skills/
```

## Where else things live

- Presentation/deck (decisions + rationale): `/Users/arturwebber/Documents/skills/tlc-plugin-plan.html` (committed to the skills repo).
- Skills repo: `/Users/arturwebber/Documents/skills` — tlc-create-pr removed; README updated.
