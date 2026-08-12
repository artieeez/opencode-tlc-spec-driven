import { z } from "zod"
import type { TlcConfig } from "./config"

/**
 * Branch name generation and validation following the tlc convention.
 * Pattern: `m{N}/{feature-slug}` e.g. `m2/agent-voice`.
 */

const branchNameSchema = z
  .string()
  .min(1, "Branch name cannot be empty")
  .max(255, "Branch name too long")
  .refine((name) => !name.startsWith("-"), "Branch name cannot start with '-'")
  .refine((name) => !name.startsWith("/") && !name.endsWith("/"), "Branch name cannot start or end with '/'")
  .refine((name) => !name.includes("//"), "Branch name cannot contain '//'")
  .refine((name) => !name.includes(".."), "Branch name cannot contain '..'")
  .refine((name) => !name.includes("@{"), "Branch name cannot contain '@{'")
  .refine((name) => !/[\x00-\x1f\x7f ~^:?*[\]\\]/.test(name), "Branch name contains invalid characters")
  .refine((name) => !name.endsWith(".lock"), "Branch name cannot end with '.lock'")

export type BranchName = z.infer<typeof branchNameSchema>

export function parseBranchCommand(command: string): string | null {
  const match = command.match(/git\s+(?:checkout\s+-b|switch\s+-c)\s+([^\s"'&|;]+)/)
  return match ? match[1] : null
}

export function generateBranchName(
  config: TlcConfig,
  milestone: number,
  slug: string,
): string {
  const cleanSlug = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  const branch = config.branch.featureSlugPattern
    .replace("{N}", String(milestone))
    .replace("{feature-slug}", cleanSlug)

  return branch.slice(0, config.branch.maxLength)
}

export function validateBranchName(
  config: TlcConfig,
  branch: string,
): { ok: true } | { ok: false; reason: string } {
  const parsed = branchNameSchema.safeParse(branch)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid branch name" }
  }

  const prefix = config.branch.milestonePrefix
  const prefixMatch = branch.match(new RegExp(`^${prefix}\\d+/`))
  if (!prefixMatch) {
    return {
      ok: false,
      reason: `Branch must match the tlc convention (e.g. ${config.branch.featureSlugPattern})`,
    }
  }

  return { ok: true }
}
