/**
 * Persistent worktree state, keyed by a project ID shared across the repo and
 * all of its worktrees. Stored as a JSON file with atomic writes so the main
 * opencode process and the opencode process running inside a worktree see the
 * same sessions and pending deletes.
 *
 * Mirrors opencode-worktree's `session.idle` + pending-delete cleanup pattern,
 * minus the sqlite dependency.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export interface WorktreeSession {
  id: string
  branch: string
  path: string
  createdAt: string
}

export interface PendingDelete {
  sessionID: string
  branch: string
  path: string
}

interface StateShape {
  sessions: WorktreeSession[]
  pendingDelete: PendingDelete | null
}

const EMPTY: StateShape = { sessions: [], pendingDelete: null }

function stateFileFor(projectId: string): string {
  const override = process.env.TLC_STATE_DIR
  const base = override ? path.resolve(override) : path.join(os.homedir(), ".local", "share", "opencode", "tlc")
  return path.join(base, `${projectId}.json`)
}

async function loadState(projectId: string): Promise<StateShape> {
  const file = stateFileFor(projectId)
  try {
    const raw = await readFile(file, "utf8")
    const parsed = JSON.parse(raw) as StateShape
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      pendingDelete: parsed.pendingDelete ?? null,
    }
  } catch {
    return { ...EMPTY }
  }
}

async function saveState(projectId: string, state: StateShape): Promise<void> {
  const file = stateFileFor(projectId)
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(state, null, 2))
  await rename(tmp, file)
}

export async function addSession(projectId: string, session: WorktreeSession): Promise<void> {
  const state = await loadState(projectId)
  state.sessions = [...state.sessions.filter((s) => s.id !== session.id), session]
  await saveState(projectId, state)
}

export async function getSession(
  projectId: string,
  sessionID: string,
): Promise<WorktreeSession | null> {
  const state = await loadState(projectId)
  return state.sessions.find((s) => s.id === sessionID) ?? null
}

export async function removeSession(projectId: string, sessionID: string): Promise<void> {
  const state = await loadState(projectId)
  state.sessions = state.sessions.filter((s) => s.id !== sessionID)
  await saveState(projectId, state)
}

export async function setPendingDelete(
  projectId: string,
  pending: PendingDelete,
): Promise<void> {
  const state = await loadState(projectId)
  state.pendingDelete = pending
  await saveState(projectId, state)
}

export async function getPendingDelete(projectId: string): Promise<PendingDelete | null> {
  const state = await loadState(projectId)
  return state.pendingDelete
}

export async function clearPendingDelete(projectId: string): Promise<void> {
  const state = await loadState(projectId)
  state.pendingDelete = null
  await saveState(projectId, state)
}

export async function getAllSessions(projectId: string): Promise<WorktreeSession[]> {
  const state = await loadState(projectId)
  return state.sessions
}
