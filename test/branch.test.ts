import { describe, expect, it } from "vitest"
import { generateBranchName, parseBranchCommand, validateBranchName } from "../src/branch"
import type { TlcConfig } from "../src/config"

const config: TlcConfig = {
  branch: {
    milestonePrefix: "m",
    featureSlugPattern: "m{N}/{feature-slug}",
    maxLength: 100,
  },
  rename: { enabled: true },
  worktree: { basePath: ".tlc", baseBranch: "main", enabled: false },
}

describe("generateBranchName", () => {
  it("builds m{N}/{feature-slug}", () => {
    expect(generateBranchName(config, 2, "Agent Voice")).toBe("m2/agent-voice")
  })

  it("normalizes slugs", () => {
    expect(generateBranchName(config, 3, "  API Gateway!! ")).toBe("m3/api-gateway")
  })

  it("truncates to maxLength", () => {
    const long = config
    const result = generateBranchName(long, 1, "x".repeat(200))
    expect(result.length).toBeLessThanOrEqual(100)
  })
})

describe("validateBranchName", () => {
  it("accepts convention branches", () => {
    expect(validateBranchName(config, "m2/agent-voice")).toEqual({ ok: true })
  })

  it("rejects non-convention branches", () => {
    expect(validateBranchName(config, "feature/foo")).toMatchObject({ ok: false })
  })

  it("rejects unsafe refs", () => {
    expect(validateBranchName(config, "m2/foo..bar")).toMatchObject({ ok: false })
    expect(validateBranchName(config, "-m2/x")).toMatchObject({ ok: false })
  })
})

describe("parseBranchCommand", () => {
  it("parses checkout -b", () => {
    expect(parseBranchCommand("git checkout -b m2/agent-voice")).toBe("m2/agent-voice")
  })

  it("parses switch -c", () => {
    expect(parseBranchCommand("git switch -c m3/foo")).toBe("m3/foo")
  })

  it("ignores non-branch git commands", () => {
    expect(parseBranchCommand("git status")).toBeNull()
  })
})
