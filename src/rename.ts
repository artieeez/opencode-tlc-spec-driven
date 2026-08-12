import type { OpencodeClient } from "./types"
import type { TlcConfig } from "./config"
import { parseBranchCommand, validateBranchName } from "./branch"

export type Logger = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

export type ToolExecuteAfter = (input: {
  tool: string
  sessionID: string
  callID: string
  args: any
}, output: {
  title: string
  output: string
  metadata: any
}) => Promise<void>

/**
 * Tracks which sessions have loaded a tlc skill, so ambient hooks can be
 * scoped to the tlc-spec-driven context instead of every session.
 * In-memory per plugin instance (per project server process).
 */
export class SessionGate {
  private active = new Set<string>()

  constructor(private skillNames: string[]) {}

  /** Detect the `skill` tool loading one of our skills. */
  handleTool(input: { tool: string; sessionID: string; args: any }): boolean {
    if (input.tool !== "skill") return false
    const name = input.args?.name
    if (typeof name === "string" && this.skillNames.includes(name)) {
      this.active.add(input.sessionID)
      return true
    }
    return false
  }

  isActive(sessionID: string): boolean {
    return this.active.has(sessionID)
  }
}

/**
 * Rename the opencode session to the branch name whenever the agent runs
 * `git checkout -b <branch>` / `git switch -c <branch>`.
 *
 * Note: `vcs.branch.updated` events carry no sessionID, so we hook the bash
 * tool call instead — this covers the agent-driven tlc-spec-driven flow.
 */
export function renameHook(
  client: OpencodeClient,
  config: TlcConfig,
  gate: SessionGate,
  log: Logger,
): ToolExecuteAfter {
  return async (input, _output) => {
    // Gate first: skill-scoped ambient behavior
    if (config.rename.scope === "skill-gated") {
      if (gate.handleTool(input)) return
      if (!gate.isActive(input.sessionID)) return
    }

    if (!config.rename.enabled) return
    if (input.tool !== "bash") return

    const branch = parseBranchCommand(String(input.args?.command ?? ""))
    if (!branch) return

    const validated = validateBranchName(config, branch)
    if (!validated.ok) {
      log.warn(`[tlc] Not renaming session: ${validated.reason}`)
      return
    }

    try {
      await client.session.update({
        path: { id: input.sessionID },
        body: { title: branch },
      })
      log.info(`[tlc] Renamed session to ${branch}`)
    } catch (error) {
      log.error(`[tlc] Failed to rename session to ${branch}: ${error}`)
    }
  }
}
