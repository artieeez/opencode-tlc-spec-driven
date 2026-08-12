import { z } from "zod"
import { parse as parseJsonc } from "jsonc-parser"
import { mkdir } from "node:fs/promises"
import * as path from "node:path"

/**
 * Branching conventions for tlc-spec-driven.
 *
 * Loaded from `.opencode/tlc.jsonc` in the project root (single source of truth).
 * Defaults match the AGENTS.md convention used by tlc-create-pr: `m{N}/{feature-slug}`.
 */

export const CONFIG_FILE = ".opencode/tlc.jsonc"

const defaultConfig = {
  branch: {
    milestonePrefix: "m",
    featureSlugPattern: "m{N}/{feature-slug}",
    maxLength: 100,
  },
  rename: {
    enabled: true,
    scope: "skill-gated",
    skillNames: ["tlc-branching", "tlc-spec-driven", "tlc-create-pr"],
  },
  worktree: {
    basePath: ".tlc",
    baseBranch: "main",
    enabled: false,
  },
} as const

const tlcConfigSchema = z.object({
  branch: z.object({
    milestonePrefix: z.string().default(defaultConfig.branch.milestonePrefix),
    featureSlugPattern: z.string().default(defaultConfig.branch.featureSlugPattern),
    maxLength: z.number().int().positive().default(defaultConfig.branch.maxLength),
  }),
  rename: z.object({
    enabled: z.boolean().default(defaultConfig.rename.enabled),
    scope: z
      .enum(["natural", "skill-gated"])
      .default(defaultConfig.rename.scope),
    skillNames: z.array(z.string()).default([...defaultConfig.rename.skillNames]),
  }),
  worktree: z.object({
    basePath: z.string().default(defaultConfig.worktree.basePath),
    baseBranch: z.string().default(defaultConfig.worktree.baseBranch),
    enabled: z.boolean().default(defaultConfig.worktree.enabled),
  }),
})

export type TlcConfig = z.infer<typeof tlcConfigSchema>

const sampleConfig = `{
  "$schema": "https://opencode.ai/schemas/tlc.json",

  // Branching conventions — parameters only, the how-to lives in the tlc-branching skill
  "branch": {
    "milestonePrefix": "m",
    "featureSlugPattern": "m{N}/{feature-slug}",
    "maxLength": 100
  },

  // Rename the opencode session to the git branch.
  // scope: "skill-gated" fires only after the skill tool loads a listed skill;
  //        "natural" relies on explicit tools + convention validation.
  "rename": {
    "enabled": true,
    "scope": "skill-gated",
    "skillNames": ["tlc-branching", "tlc-spec-driven", "tlc-create-pr"]
  },

  // Worktree automation (work in progress)
  "worktree": {
    "enabled": false,
    "basePath": ".tlc",
    "baseBranch": "main"
  }
}
`

export async function loadTlcConfig(
  directory: string,
  log: { warn: (msg: string) => void },
): Promise<TlcConfig> {
  const configPath = path.join(directory, CONFIG_FILE)
  try {
    const file = Bun.file(configPath)
    if (!(await file.exists())) {
      await mkdir(path.dirname(configPath), { recursive: true })
      await Bun.write(configPath, sampleConfig)
      log.warn(`[tlc] Created default config: ${configPath}`)
      return tlcConfigSchema.parse({})
    }

    const content = await file.text()
    const parsed = parseJsonc(content)
    if (parsed === undefined) {
      log.warn(`[tlc] Invalid ${CONFIG_FILE} syntax, using defaults`)
      return tlcConfigSchema.parse({})
    }
    return tlcConfigSchema.parse(parsed)
  } catch (error) {
    log.warn(`[tlc] Failed to load config: ${error}, using defaults`)
    return tlcConfigSchema.parse({})
  }
}
