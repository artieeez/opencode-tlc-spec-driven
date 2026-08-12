---
name: tlc-branching
description: Branching conventions and worktree workflow for tlc-spec-driven features. Use when creating, validating, or checking out feature branches (m{N}/{feature-slug}), deciding whether to work in a git worktree, or renaming sessions to their branch. Replaces the branching conventions previously kept in AGENTS.md.
license: CC-BY-4.0
metadata:
  plugin: opencode-tlc-spec-driven
---

# TLC Branching

Branching conventions for `tlc-spec-driven` features. This skill replaces the
branching section that used to live in `AGENTS.md` — the conventions are now
owned by the `opencode-tlc-spec-driven` plugin.

## Conventions

- **Branch pattern**: `m{N}/{feature-slug}` (e.g. `m2/agent-voice`)
- **Parameters** (prefix, pattern, max length) come from `.opencode/tlc.jsonc` — never hardcode them in prompts.
- **One feature per branch** — never mix features on a branch.
- **Base**: create feature branches from updated `main` (or the repo's default branch), never from another feature branch.

## How to name a branch

Never invent a branch name. Use the `tlc_branch` tool:

- **Generate**: pass the milestone and a feature slug; the tool normalizes the slug and applies the pattern from `.opencode/tlc.jsonc`.
- **Validate**: pass a proposed name; the tool confirms it matches the convention and rejects unsafe refs.

The slug should come from the feature's spec (`.specs/features/<slug>/` when present), matching the roadmap vocabulary.

## Worktrees

When the current session is already busy on a feature branch, do not reuse it —
start isolated work on a new git worktree:

- Use the `tlc_worktree` tool (explicit, opt-in). Pass `milestone` + `slug` (or a generated `branch` name); the plugin creates the worktree as a sibling directory, forks the current session into it, and launches a terminal there running `opencode --session <forkedId>`.
- Worktree naming follows the same `m{N}/{feature-slug}` convention.
- Worktree location: sibling of the repo (`.tlc`-style base path is configurable in `.opencode/tlc.jsonc`). The terminal launch command is `worktree.launchCommand` (default `opencode`).
- When the feature is done, call `tlc_worktree_delete` from the worktree session. The plugin commits any changes and removes the worktree once the session ends.

## Session naming

The plugin renames the opencode session to the current branch automatically
(agent-run `git checkout -b` / `switch -c`). No manual action needed.

## Notes

- The plugin and this skill ship together. Install the plugin (`opencode plugin opencode-tlc-spec-driven`) and copy `skill/tlc-branching/` from the package into your skills directory (`~/.agents/skills/` for global, `.opencode/skills/` for project-scoped).
- If a convention differs from what you see in `.opencode/tlc.jsonc`, the JSONC file wins — update it, not this skill.
