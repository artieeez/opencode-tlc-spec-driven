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

- Use the `tlc_worktree` tool (explicit, opt-in). The plugin creates the worktree as a sibling directory and forks the session into it.
- Worktree naming follows the same `m{N}/{feature-slug}` convention.
- Worktree location: sibling of the repo (`.tlc`-style base path is configurable in `.opencode/tlc.jsonc`).

## Session naming

The plugin renames the opencode session to the current branch automatically
(agent-run `git checkout -b` / `switch -c`). No manual action needed.

## Notes

- The plugin and this skill ship together. Install the plugin (`opencode plugin opencode-tlc-spec-driven`) and this skill is placed into your skills directory automatically.
- If a convention differs from what you see in `.opencode/tlc.jsonc`, the JSONC file wins — update it, not this skill.
