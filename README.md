# opencode-tlc-spec-driven

An opencode plugin centered on [tlc-spec-driven](https://github.com/arturwebber/skills) workflows.

## Features

1. **Branch conventions** — parameters live in `.opencode/tlc.jsonc` (auto-created with defaults matching the `m{N}/{feature-slug}` convention). **The how-to lives in the companion `tlc-branching` skill**, which replaces the branching section previously kept in `AGENTS.md`.
2. **`tlc_branch` tool** — generates and validates branch names so the agent never invents them.
3. **Session rename** — when the agent runs `git checkout -b <branch>` (or `switch -c`), the opencode session is renamed to the branch via `client.session.update()`. Scoped with `rename.scope: "skill-gated"` so it only fires in sessions that loaded a tlc skill.
4. **`tlc_worktree` tool** *(scaffold)* — starts isolated work on a git worktree (sibling directory) and forks the session, when the current session is busy.

## Install

As an npm package:

```bash
opencode plugin opencode-tlc-spec-driven
```

The companion skills ship in the package under `skill/` but are **not auto-installed** — copy them into your skills directory manually:

```bash
cp -r node_modules/opencode-tlc-spec-driven/skill/tlc-branching ~/.agents/skills/
cp -r node_modules/opencode-tlc-spec-driven/skill/tlc-create-pr ~/.agents/skills/
```

Project-scoped alternative — drop them in the project instead of `~/.agents/skills/`:

```bash
cp -r node_modules/opencode-tlc-spec-driven/skill/tlc-branching .opencode/skills/
cp -r node_modules/opencode-tlc-spec-driven/skill/tlc-create-pr .opencode/skills/
```

Repo-level plugin alternative:

```bash
mkdir -p .opencode/plugins
cp -r dist ~/.opencode-plugins/  # or symlink this repo into ~/.config/opencode/plugins/
```

## Companion skills

Shipped in the npm package under `skill/` (install manually, see above):

- `skill/tlc-branching/SKILL.md` — branch conventions and worktree workflow (replaces AGENTS.md conventions); instructs the agent to use `tlc_branch` / `tlc_worktree`.
- `skill/tlc-create-pr/SKILL.md` — closes out a TLC roadmap feature: sync ROADMAP + Mermaid `/roadmap`, merge `main`, run local `bin/ci`, open a GitHub PR when green, checkout the next branch. Migrated from the standalone skills repo.

Parameters stay in `.opencode/tlc.jsonc`; the JSONC file wins on any conflict.

When removing the old conventions from `AGENTS.md`, delete the branching section and (optionally) point to this skill instead.

## Configuration

The plugin auto-creates `.opencode/tlc.jsonc` on first run:

```jsonc
{
  "branch": {
    "milestonePrefix": "m",
    "featureSlugPattern": "m{N}/{feature-slug}",
    "maxLength": 100
  },
  "rename": {
    "enabled": true,
    "scope": "skill-gated",
    "skillNames": ["tlc-branching", "tlc-spec-driven"]
  },
  "worktree": {
    "enabled": false,
    "basePath": ".tlc",
    "baseBranch": "main"
  }
}
```

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
```

## Notes / limitations

- Session rename triggers on **agent-run** `git checkout -b` (bash tool), gated to sessions that loaded a tlc skill (`rename.scope`). `vcs.branch.updated` events carry no sessionID, so terminal-typed branch switches are not caught.
- Worktree automation has open questions: trigger, worktree location, and who picks the branch name. See `src/worktree.ts`.
- The companion skills are installed manually (see Install). opencode discovers `~/.agents/skills/` (global) and `.opencode/skills/` (project-scoped).
