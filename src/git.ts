/**
 * Safe git helpers using Bun.spawn with explicit argument arrays.
 * Avoids shell interpolation entirely (pattern from opencode-worktree).
 */

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export const Result = {
  ok: <T, E = never>(value: T): Result<T, E> => ({ ok: true, value }),
  err: <E, T = never>(error: E): Result<T, E> => ({ ok: false, error }),
}

export async function git(args: string[], cwd: string): Promise<Result<string, string>> {
  try {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode !== 0) {
      return Result.err(stderr.trim() || `git ${args[0]} failed`)
    }
    return Result.ok(stdout.trim())
  } catch (error) {
    return Result.err(error instanceof Error ? error.message : String(error))
  }
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

export function joinWorktreePath(repoRoot: string, branch: string, basePath: string): string {
  const slug = branch.replace(/\//g, "-")
  return `${repoRoot}/${basePath.replace(/\/$/, "")}/${slug}`
}
