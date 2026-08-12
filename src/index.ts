import { type Plugin, tool } from "@opencode-ai/plugin"
import { loadTlcConfig, type TlcConfig } from "./config"
import { generateBranchName, validateBranchName } from "./branch"
import { renameHook, type Logger } from "./rename"

/**
 * opencode-tlc-spec-driven
 *
 * A plugin centered on tlc-spec-driven:
 *   1. Branch conventions — single source of truth in `.opencode/tlc.jsonc`
 *   2. `tlc.branch` tool — generate/validate `m{N}/{feature-slug}` names
 *   3. Session rename — rename the opencode session to the git branch
 *   4. Worktree automation — scaffold (see src/worktree.ts)
 */
export const TlcSpecDrivenPlugin: Plugin = async ({ client, directory }) => {
  const log: Logger = {
    info: (msg) => client.app.log({ body: { service: "tlc", level: "info", message: msg } }).catch(() => {}),
    warn: (msg) => client.app.log({ body: { service: "tlc", level: "warn", message: msg } }).catch(() => {}),
    error: (msg) => client.app.log({ body: { service: "tlc", level: "error", message: msg } }).catch(() => {}),
  }

  const config: TlcConfig = await loadTlcConfig(directory, log)

  return {
    "tool.execute.after": renameHook(client, config, log),

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
    },
  }
}

export default TlcSpecDrivenPlugin
