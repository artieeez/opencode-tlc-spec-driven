/**
 * Safe git helpers using node:child_process execFile with explicit argument
 * arrays. Avoids shell interpolation entirely (pattern from opencode-worktree).
 * Works in both the Bun opencode runtime and the node test runner.
 */

import * as os from "node:os"
import * as path from "node:path"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const Result = {
  ok: <T, E = never>(value: T): Result<T, E> => ({ ok: true, value }),
  err: <E, T = never>(error: E): Result<T, E> => ({ ok: false, error }),
}

export function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr?.toString() ?? "").trim() || error.message
        resolve(Result.err(message || `${cmd} failed`))
        return
      }
      resolve(Result.ok(stdout?.toString().trim() ?? ""))
    })
  })
}

export async function git(args: string[], cwd: string): Promise<Result<string, string>> {
  return runCommand("git", args, cwd)
}

export async function currentBranch(cwd: string): Promise<Result<string, string>> {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await git(["rev-parse", "--verify", branch], cwd)
  return result.ok
}

export async function createWorktree(
  repoRoot: string,
  branch: string,
  baseBranch: string,
  basePath: string,
): Promise<Result<string, string>> {
  const worktreePath = joinWorktreePath(repoRoot, branch, basePath)
  const exists = await branchExists(repoRoot, branch)

  const result = exists
    ? await git(["worktree", "add", worktreePath, branch], repoRoot)
    : await git(["worktree", "add", "-b", branch, worktreePath, baseBranch], repoRoot)

  return result.ok ? Result.ok(worktreePath) : result
}

export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<Result<void, string>> {
  const result = await git(["worktree", "remove", "--force", worktreePath], repoRoot)
  return result.ok ? Result.ok(undefined) : result
}

/**
 * Resolve a base path that may be relative, absolute, or start with `~`.
 * Relative paths are resolved against the repo's parent (sibling directory).
 */
export function resolveWorktreeBase(repoRoot: string, basePath: string): string {
  if (basePath === "~") return os.homedir()
  if (basePath.startsWith("~/")) return path.join(os.homedir(), basePath.slice(2))
  if (path.isAbsolute(basePath)) return basePath
  return path.resolve(path.dirname(repoRoot), basePath)
}

/**
 * Worktrees live as a sibling of the repo, e.g. `<parent>/.tlc/m2-agent-voice`.
 * Slashes in the branch name are flattened so the path stays a single dir.
 */
export function joinWorktreePath(repoRoot: string, branch: string, basePath: string): string {
  const slug = branch.replace(/\//g, "-")
  return path.join(resolveWorktreeBase(repoRoot, basePath), slug)
}

/**
 * Stable project ID shared across a repo and all of its worktrees.
 * Uses the first root commit SHA; falls back to a hash of the resolved
 * common git dir so every worktree resolves to the same value.
 */
export async function getProjectId(repoRoot: string): Promise<string> {
  const rootCommit = await git(["rev-list", "--max-parents=0", "--all"], repoRoot)
  if (rootCommit.ok) {
    const root = rootCommit.value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort()[0]
    if (root) return root
  }

  const commonDir = await git(["rev-parse", "--git-common-dir"], repoRoot)
  const key = commonDir.ok ? commonDir.value : repoRoot
  return createHash("sha256").update(path.resolve(repoRoot, key)).digest("hex").slice(0, 16)
}
