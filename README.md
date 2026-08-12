# opencode-tlc-spec-driven

[![CI](https://github.com/artieeez/opencode-tlc-spec-driven/actions/workflows/ci.yml/badge.svg)](https://github.com/artieeez/opencode-tlc-spec-driven/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An opencode plugin that runs the [tlc-spec-driven](https://github.com/tech-leads-club/agent-skills) roadmap loop: take a roadmap milestone + feature, create the `m{N}/{feature-slug}` branch (and optionally a worktree), rename the session to the branch, and after the PR move on to the next feature. It automates the branch, session, and worktree mechanics so the agent follows the conventions instead of inventing them.

Opinionated: built for personal projects that keep an in-repo ROADMAP (`.specs/project/ROADMAP.md`) and want to run several features in parallel across branches and worktrees. If your project doesn't use a ROADMAP or parallel worktrees, parts of this won't apply — the plugin and its tools are opt-in per convention.

## Features

- **Branch conventions** — configuration lives in `.opencode/tlc.jsonc`, auto-created with defaults matching the `m{N}/{feature-slug}` convention. The how-to lives in the companion `tlc-branching` skill.
- **`tlc_branch` tool** — generates and validates branch names so the agent never invents them.
- **Session rename** — when the agent runs `git checkout -b <branch>` (or `switch -c`), the opencode session is renamed to the branch via `client.session.update()`. Scoped with `rename.scope: "skill-gated"`, so it only fires in sessions that loaded a tlc skill.
- **`tlc_worktree` tool** *(scaffold)* — starts isolated work on a git worktree (a sibling directory) and forks the session when the current session is busy.

## Install

Each install is two steps: register the plugin, then add its companion skills.

### Project-scoped

```bash
opencode plugin opencode-tlc-spec-driven
npx skills add artieeez/opencode-tlc-spec-driven -s '*' -y
```

### Global

```bash
opencode plugin opencode-tlc-spec-driven --global
npx skills add artieeez/opencode-tlc-spec-driven -s '*' -g -y -a opencode
```

## Companion skills

- `skill/tlc-branching/SKILL.md` — branch conventions and worktree workflow; instructs the agent to use `tlc_branch` / `tlc_worktree`.
- `skill/tlc-create-pr/SKILL.md` — closes out a TLC roadmap feature: sync ROADMAP, merge `main`, run the project's CI gate when configured (skip otherwise), open a GitHub PR when green, then checkout the next branch.

Parameters stay in `.opencode/tlc.jsonc`; the JSONC file wins on any conflict.

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
    "skillNames": ["tlc-branching", "tlc-spec-driven", "tlc-create-pr"]
  },
  "worktree": {
    "enabled": false,
    "basePath": ".tlc",
    "baseBranch": "main"
  },
  "createPr": {
    "ci": ""
  }
}
```

Four groups of settings:

- `branch` — how the agent names branches.
- `rename` — when the session is renamed to match the branch.
- `worktree` — where and how worktree automation runs (disabled by default).
- `createPr` — `ci`: local CI command run before opening a PR. Empty (default) = skip the local CI gate.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
```

## Notes / limitations

- **Session rename** — triggers on **agent-run** `git checkout -b` (bash tool), gated to sessions that loaded a tlc skill (`rename.scope`). `vcs.branch.updated` events carry no sessionID, so terminal-typed branch switches are not caught.
- **Worktree automation** — open questions remain: trigger, worktree location, and who picks the branch name. See `src/worktree.ts`.
