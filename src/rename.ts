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
 * Rename the opencode session to the branch name whenever the agent runs
 * `git checkout -b <branch>` / `git switch -c <branch>`.
 *
 * Note: `vcs.branch.updated` events carry no sessionID, so we hook the bash
 * tool call instead — this covers the agent-driven tlc-spec-driven flow.
 */
export function renameHook(
  client: OpencodeClient,
  config: TlcConfig,
  log: Logger,
): ToolExecuteAfter {
  return async (input, _output) => {
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
