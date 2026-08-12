import type { TlcConfig } from "./config"
import type { OpencodeClient } from "./types"
import type { Logger } from "./rename"
import {
  createWorktree,
  removeWorktree,
  git,
  currentBranch,
  getProjectId,
} from "./git"
import { openTerminal } from "./terminal"
import {
  addSession,
  clearPendingDelete,
  getPendingDelete,
  getSession,
  removeSession,
  setPendingDelete,
  type PendingDelete,
} from "./state"

export interface OpenWorktreeResult {
  worktreePath: string
  forkedSessionID: string
  terminalLaunched: boolean
}

/**
 * Open a new feature in an isolated git worktree:
 *   1. Create the worktree as a sibling of the repo on `branch` (off `baseBranch`).
 *   2. Fork the current session into the worktree directory (session-fork →
 *      terminal handoff).
 *   3. Launch a terminal in the worktree running `launchCommand --session <forkedId>`.
 *   4. Record the session→worktree mapping for cleanup on session end.
 */
export async function openWorktree(
  client: OpencodeClient,
  sessionID: string,
  directory: string,
  config: TlcConfig,
  branch: string,
  log: Logger,
): Promise<OpenWorktreeResult> {
  const created = await createWorktree(
    directory,
    branch,
    config.worktree.baseBranch,
    config.worktree.basePath,
  )
  if (!created.ok) {
    throw new Error(`Failed to create worktree: ${created.error}`)
  }
  const worktreePath = created.value
  log.info(`[tlc] Created worktree at ${worktreePath}`)

  const projectId = await getProjectId(worktreePath)

  const forked = await client.session
    .fork({ path: { id: sessionID }, body: {}, query: { directory: worktreePath } })
    .then((r) => r.data)
    .catch((e: unknown) => {
      log.error(`[tlc] Failed to fork session: ${e}`)
      return null
    })
  const forkedSessionID = forked?.id ?? sessionID

  await addSession(projectId, {
    id: forkedSessionID,
    branch,
    path: worktreePath,
    createdAt: new Date().toISOString(),
  })

  const argv = [config.worktree.launchCommand, "--session", forkedSessionID]
  const terminalResult = await openTerminal(worktreePath, argv, branch)
  if (!terminalResult.success) {
    log.warn(
      `[tlc] Terminal launch failed: ${terminalResult.error}. ` +
        `Resume manually: cd ${worktreePath} && ${config.worktree.launchCommand} --session ${forkedSessionID}`,
    )
  }

  return { worktreePath, forkedSessionID, terminalLaunched: terminalResult.success }
}

export interface RequestDeleteResult {
  ok: boolean
  reason?: string
}

/**
 * Mark the session's worktree for deletion. The worktree is committed and
 * removed when the session goes idle (see handleSessionIdle).
 */
export async function requestWorktreeDelete(
  sessionID: string,
  directory: string,
  log: Logger,
): Promise<RequestDeleteResult> {
  const projectId = await getProjectId(directory)
  const session = await getSession(projectId, sessionID)
  if (!session) {
    return { ok: false, reason: "No worktree is associated with this session." }
  }

  await setPendingDelete(projectId, {
    sessionID,
    branch: session.branch,
    path: session.path,
  })
  log.info(`[tlc] Marked worktree ${session.branch} for cleanup on session end`)
  return { ok: true }
}

async function performPendingDelete(
  projectId: string,
  pending: PendingDelete,
  log: Logger,
): Promise<void> {
  log.info(`[tlc] Cleaning up worktree ${pending.branch} (${pending.path})`)

  // Commit any uncommitted changes so nothing is lost.
  await git(["add", "-A"], pending.path)
  await git(["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"], pending.path)

  const removed = await removeWorktree(pending.path, pending.path)
  if (!removed.ok) {
    log.warn(`[tlc] Failed to remove worktree: ${removed.error}`)
  }

  await removeSession(projectId, pending.sessionID)
  await clearPendingDelete(projectId)
}

/**
 * session.idle handler — mirror opencode-worktree's pending-delete pattern.
 * When a worktree session ends, commit and remove the worktree.
 */
export async function handleSessionIdle(
  sessionID: string,
  directory: string,
  log: Logger,
): Promise<void> {
  const projectId = await getProjectId(directory)
  const pending = await getPendingDelete(projectId)
  if (!pending || pending.sessionID !== sessionID) return

  await performPendingDelete(projectId, pending, log)
}

/**
 * session.deleted handler — remove any worktree record for a session that was
 * deleted without going through the delete tool, so records don't accumulate.
 */
export async function handleSessionDeleted(
  sessionID: string,
  directory: string,
  log: Logger,
): Promise<void> {
  const projectId = await getProjectId(directory)
  const session = await getSession(projectId, sessionID)
  if (session) {
    log.info(`[tlc] Session deleted, dropping worktree record for ${session.branch}`)
    await removeSession(projectId, sessionID)
  }
}

export { git, currentBranch }
