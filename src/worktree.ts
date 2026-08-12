import type { TlcConfig } from "./config"
import type { OpencodeClient } from "./types"
import type { Logger } from "./rename"
import { createWorktree, git, currentBranch } from "./git"

/**
 * Worktree automation — scaffold.
 *
 * Goal: when a session is already busy on a feature, a new session auto-starts
 * on a fresh git worktree named with the tlc convention.
 *
 * Patterns borrowed from opencode-worktree (session.fork + parentID chain walk).
 * Open questions from planning:
 *   - trigger (session.created? branch !== main? config opt-in?)
 *   - worktree location (.tlc/, ../worktrees, opencode-managed)
 *   - who picks the branch name (tlc.branch tool vs skill Specify phase)
 */
export async function ensureWorktree(
  client: OpencodeClient,
  sessionID: string,
  directory: string,
  config: TlcConfig,
  branch: string,
  log: Logger,
): Promise<string> {
  const base = config.worktree.baseBranch

  const current = await currentBranch(directory)
  if (current.ok && current.value === base) {
    log.info(`[tlc] On ${base}, no worktree needed`)
    return directory
  }

  const created = await createWorktree(directory, branch, base, config.worktree.basePath)
  if (!created.ok) {
    throw new Error(`Failed to create worktree: ${created.error}`)
  }
  log.info(`[tlc] Created worktree at ${created.value}`)

  const forked = await client.session
    .fork({ path: { id: sessionID }, body: {} })
    .then((r) => r.data)
    .catch((e: unknown) => {
      log.error(`[tlc] Failed to fork session: ${e}`)
      return null
    })

  return forked ? forked.id : sessionID
}

export { git }
