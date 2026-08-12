# opencode-tlc-spec-driven

An opencode plugin centered on [tlc-spec-driven](https://github.com/arturwebber/skills) workflows.

## Features

1. **Branch conventions** — single source of truth in `.opencode/tlc.jsonc` (auto-created with defaults matching the `m{N}/{feature-slug}` convention).
2. **`tlc_branch` tool** — generates and validates branch names so the agent never invents them.
3. **Session rename** — when the agent runs `git checkout -b <branch>` (or `switch -c`), the opencode session is renamed to the branch. Runs through `client.session.update()`, so the TUI and desktop app update live.
4. **Worktree automation** *(scaffold)* — auto-start new sessions on a fresh git worktree when the main branch is busy.

## Install

Repo-level (recommended for a per-project plugin):

```bash
mkdir -p .opencode/plugins
cp -r src .opencode/plugins/tlc
```

Or global (all projects):

```bash
mkdir -p ~/.config/opencode/plugins
cp -r src ~/.config/opencode/plugins/tlc
```

Or as an npm package (once published):

```bash
opencode plugin opencode-tlc-spec-driven
```

## Configuration

The plugin auto-creates `.opencode/tlc.jsonc` on first run:

```jsonc
{
  "branch": {
    "milestonePrefix": "m",
    "featureSlugPattern": "m{N}/{feature-slug}",
    "maxLength": 100
  },
  "rename": { "enabled": true },
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

- Session rename triggers on **agent-run** `git checkout -b` (bash tool). `vcs.branch.updated` events carry no sessionID, so terminal-typed branch switches are not caught.
- Worktree automation has open questions: trigger, worktree location, and who picks the branch name. See `src/worktree.ts`.
