import { type Plugin, tool } from "@opencode-ai/plugin"
import { type Event } from "@opencode-ai/sdk"
import { loadTlcConfig, type TlcConfig } from "./config"
import { generateBranchName, validateBranchName } from "./branch"
import { renameHook, SessionGate, type Logger } from "./rename"
import {
  openWorktree,
  requestWorktreeDelete,
  handleSessionIdle,
  handleSessionDeleted,
} from "./worktree"

/**
 * opencode-tlc-spec-driven
 *
 * A plugin centered on tlc-spec-driven:
 *   1. Branch conventions — single source of truth in `.opencode/tlc.jsonc`
 *   2. `tlc.branch` tool — generate/validate `m{N}/{feature-slug}` names
 *   3. Session rename — rename the opencode session to the git branch
 *   4. Worktree automation — create isolated worktrees, fork + hand off the
 *      session to a terminal, and clean up on session end
 */
export const TlcSpecDrivenPlugin: Plugin = async ({ client, directory }) => {
  const log: Logger = {
    info: (msg) => client.app.log({ body: { service: "tlc", level: "info", message: msg } }).catch(() => {}),
    warn: (msg) => client.app.log({ body: { service: "tlc", level: "warn", message: msg } }).catch(() => {}),
    error: (msg) => client.app.log({ body: { service: "tlc", level: "error", message: msg } }).catch(() => {}),
  }

  const config: TlcConfig = await loadTlcConfig(directory, log)
  const gate = new SessionGate(config.rename.skillNames)

  return {
    "tool.execute.after": renameHook(client, config, gate, log),

    event: async ({ event }: { event: Event }) => {
      if (event.type === "session.idle") {
        await handleSessionIdle(event.properties.sessionID, directory, log)
      } else if (event.type === "session.deleted") {
        await handleSessionDeleted(event.properties.info.id, directory, log)
      }
    },

    tool: {
      tlc_branch: tool({
        description:
          "Generate or validate a tlc-spec-driven branch name following the project convention (e.g. m2/feature-slug). Use this instead of inventing branch names.",
        args: {
          mode: tool.schema
            .enum(["generate", "validate"])
            .describe("'generate' builds a branch name; 'validate' checks an existing name"),
          milestone: tool.schema
            .number()
            .int()
            .positive()
            .optional()
            .describe("Milestone number N for generate mode"),
          slug: tool.schema
            .string()
            .optional()
            .describe("Feature slug for generate mode (e.g. 'agent-voice')"),
          branch: tool.schema
            .string()
            .optional()
            .describe("Branch name to validate for validate mode"),
        },
        async execute(args) {
          if (args.mode === "generate") {
            if (args.milestone === undefined || !args.slug) {
              return "generate requires both 'milestone' and 'slug'"
            }
            return generateBranchName(config, args.milestone, args.slug)
          }

          if (!args.branch) {
            return "validate requires 'branch'"
          }
          const result = validateBranchName(config, args.branch)
          return result.ok ? "ok" : result.reason
        },
      }),

      tlc_worktree: tool({
        description:
          "Start a new tlc feature in an isolated git worktree. Creates the worktree as a sibling of the repo on a m{N}/{feature-slug} branch, forks the current session into it, and launches a terminal running opencode in the worktree. Use when the current session is already busy on a feature branch. Pass a generated 'branch' name, or 'milestone' + 'slug' to have it generated.",
        args: {
          branch: tool.schema
            .string()
            .optional()
            .describe("Branch name for the worktree (m{N}/{feature-slug}). Generated from milestone+slug if omitted."),
          milestone: tool.schema
            .number()
            .int()
            .positive()
            .optional()
            .describe("Milestone number N for the branch"),
          slug: tool.schema.string().optional().describe("Feature slug for the branch"),
        },
        async execute(args, ctx) {
          if (!config.worktree.enabled) {
            return "Worktree automation is disabled. Enable 'worktree.enabled' in .opencode/tlc.jsonc to use this tool."
          }

          let branch = args.branch
          if (!branch) {
            if (args.milestone === undefined || !args.slug) {
              return "Provide a 'branch', or both 'milestone' and 'slug' to generate one."
            }
            branch = generateBranchName(config, args.milestone, args.slug)
          }

          const validated = validateBranchName(config, branch)
          if (!validated.ok) {
            return `Invalid branch name: ${validated.reason}. Use the tlc_branch tool to generate a valid name.`
          }

          try {
            const result = await openWorktree(
              client,
              ctx.sessionID,
              ctx.directory,
              config,
              branch,
              log,
            )
            const resume = `${config.worktree.launchCommand} --session ${result.forkedSessionID}`
            return (
              `Worktree ready for ${branch} at ${result.worktreePath}.\n` +
              `Session ${result.forkedSessionID} forked and ${result.terminalLaunched ? "launched in a terminal" : "ready to resume"}: ${resume}\n` +
              `When finished, call tlc_worktree_delete so the worktree is committed and cleaned up.`
            )
          } catch (error) {
            log.error(`[tlc] Worktree creation failed: ${error}`)
            return `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`
          }
        },
      }),

      tlc_worktree_delete: tool({
        description:
          "Finish work in the current session's worktree: commit any changes, remove the worktree directory, and drop its branch. The worktree is cleaned up when the session goes idle.",
        args: {},
        async execute(_args, ctx) {
          const result = await requestWorktreeDelete(ctx.sessionID, ctx.directory, log)
          if (!result.ok) {
            return `No worktree to delete: ${result.reason}`
          }
          return "Worktree marked for cleanup. It will be committed and removed when this session ends."
        },
      }),
    },
  }
}

export default TlcSpecDrivenPlugin
