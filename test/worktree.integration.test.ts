import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { runCommand, createWorktree, removeWorktree, getProjectId, currentBranch, git } from "../src/git"
import { addSession, getSession, getAllSessions, getPendingDelete } from "../src/state"
import { openWorktree, requestWorktreeDelete, handleSessionIdle } from "../src/worktree"
import type { TlcConfig } from "../src/config"

/** Initialize a throwaway git repo with one commit. */
async function initRepo(parent: string, name: string): Promise<string> {
  const repo = path.join(parent, name)
  await fs.mkdir(repo, { recursive: true })
  await runCommand("git", ["init", "-q", "-b", "main"], repo)
  await runCommand("git", ["config", "user.email", "test@example.com"], repo)
  await runCommand("git", ["config", "user.name", "Test"], repo)
  await fs.writeFile(path.join(repo, "README.md"), "hello\n")
  await runCommand("git", ["add", "-A"], repo)
  await runCommand("git", ["commit", "-qm", "initial"], repo)
  return repo
}

const config: TlcConfig = {
  branch: { milestonePrefix: "m", featureSlugPattern: "m{N}/{feature-slug}", maxLength: 100 },
  rename: { enabled: true },
  worktree: { basePath: ".tlc", baseBranch: "main", launchCommand: "opencode", enabled: true },
}

const noopLog = { info: () => {}, warn: () => {}, error: () => {} }

describe("worktree integration (real git)", () => {
  let dir: string
  let repo: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tlc-it-"))
    process.env.TLC_STATE_DIR = dir
    repo = await initRepo(dir, "repo")
  })

  afterEach(async () => {
    delete process.env.TLC_STATE_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("creates a worktree as a sibling and removes it", async () => {
    const created = await createWorktree(repo, "m2/agent-voice", "main", ".tlc")
    expect(created.ok).toBe(true)

    const wtPath = created.ok ? created.value : ""
    expect(wtPath).toBe(path.join(dir, ".tlc", "m2-agent-voice"))
    expect(await fs.stat(wtPath).then((s) => s.isDirectory())).toBe(true)

    const branch = await currentBranch(wtPath)
    expect(branch.ok && branch.value).toBe("m2/agent-voice")

    const removed = await removeWorktree(wtPath, wtPath)
    expect(removed.ok).toBe(true)
    await expect(fs.stat(wtPath)).rejects.toThrow()
  })

  it("resolves the same project ID from repo and worktree", async () => {
    const created = await createWorktree(repo, "m3/foo", "main", ".tlc")
    expect(created.ok).toBe(true)
    const mainId = await getProjectId(repo)
    const wtId = await getProjectId(created.ok ? created.value : repo)
    expect(wtId).toBe(mainId)
    expect(mainId).toMatch(/^[0-9a-f]{40}$/)
  })

  it("checks out an existing branch into a worktree instead of creating a new branch", async () => {
    await runCommand("git", ["checkout", "-q", "-b", "m2/existing"], repo)
    await runCommand("git", ["checkout", "-q", "main"], repo)

    const created = await createWorktree(repo, "m2/existing", "main", ".tlc")
    expect(created.ok).toBe(true)

    // Same branch, no duplicate — git worktree list should have exactly one m2/existing
    const list = await git(["worktree", "list"], repo)
    expect(list.ok && list.value.split("\n").filter((l) => l.includes("m2/existing")).length).toBe(1)
  })
})

describe("worktree lifecycle (open → delete → idle)", () => {
  let dir: string
  let repo: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tlc-life-"))
    process.env.TLC_STATE_DIR = dir
    repo = await initRepo(dir, "repo")
  })

  afterEach(async () => {
    delete process.env.TLC_STATE_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("forks the session, records it, and cleans up on idle", async () => {
    const client = {
      session: {
        fork: vi.fn().mockResolvedValue({ data: { id: "forked-1" } }),
      },
    } as unknown as Parameters<typeof openWorktree>[0]

    const opened = await openWorktree(
      client,
      "parent-session",
      repo,
      config,
      "m2/agent-voice",
      noopLog,
      { openTerminalFn: async () => ({ success: true }) },
    )
    expect(opened.forkedSessionID).toBe("forked-1")
    expect(opened.terminalLaunched).toBe(true)
    expect(client.session.fork).toHaveBeenCalledWith({
      path: { id: "parent-session" },
      body: {},
      query: { directory: opened.worktreePath },
    })

    const projectId = await getProjectId(repo)
    const record = await getSession(projectId, "forked-1")
    expect(record).toMatchObject({ branch: "m2/agent-voice", path: opened.worktreePath })

    const del = await requestWorktreeDelete("forked-1", repo, noopLog)
    expect(del.ok).toBe(true)
    expect(await getPendingDelete(projectId)).toMatchObject({ sessionID: "forked-1" })

    // Worktree still exists until the session goes idle
    expect(await fs.stat(opened.worktreePath).then((s) => s.isDirectory())).toBe(true)

    await handleSessionIdle("forked-1", repo, noopLog)

    // Worktree removed, pending cleared, record dropped
    await expect(fs.stat(opened.worktreePath)).rejects.toThrow()
    expect(await getPendingDelete(projectId)).toBeNull()
    expect(await getAllSessions(projectId)).toHaveLength(0)
  })

  it("ignores idle events for sessions without a pending delete", async () => {
    await openWorktree(
      { session: { fork: vi.fn().mockResolvedValue({ data: { id: "forked-2" } }) } } as never,
      "parent",
      repo,
      config,
      "m2/other",
      noopLog,
      { openTerminalFn: async () => ({ success: true }) },
    )

    const projectId = await getProjectId(repo)
    const before = await getAllSessions(projectId)
    await handleSessionIdle("forked-2", repo, noopLog)
    expect(await getAllSessions(projectId)).toHaveLength(before.length)
  })

  it("requestWorktreeDelete fails for sessions with no worktree", async () => {
    const result = await requestWorktreeDelete("unknown-session", repo, noopLog)
    expect(result.ok).toBe(false)
  })
})
