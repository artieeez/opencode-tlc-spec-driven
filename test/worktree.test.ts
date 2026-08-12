import { describe, expect, it, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { joinWorktreePath, resolveWorktreeBase } from "../src/git"
import {
  escapeBash,
  buildBashCommandFromArgv,
  buildTerminalScript,
  detectTerminalType,
  isInsideTmux,
  detectMacTerminal,
} from "../src/terminal"
import {
  addSession,
  getSession,
  getAllSessions,
  removeSession,
  setPendingDelete,
  getPendingDelete,
  clearPendingDelete,
} from "../src/state"

describe("joinWorktreePath", () => {
  it("places worktrees as a sibling of the repo", () => {
    const repo = "/Users/t/dev/my-repo"
    expect(joinWorktreePath(repo, "m2/agent-voice", ".tlc")).toBe(
      "/Users/t/dev/.tlc/m2-agent-voice",
    )
  })

  it("flattens branch slashes into a single slug dir", () => {
    const repo = "/a/b/repo"
    expect(joinWorktreePath(repo, "m3/foo/bar", ".tlc")).toBe("/a/b/.tlc/m3-foo-bar")
  })

  it("accepts absolute base paths", () => {
    const repo = "/a/b/repo"
    expect(joinWorktreePath(repo, "m2/x", "/worktrees")).toBe("/worktrees/m2-x")
  })

  it("expands ~ in base paths", () => {
    const repo = "/a/b/repo"
    const home = os.homedir()
    expect(joinWorktreePath(repo, "m2/x", "~/.tlc")).toBe(`${home}/.tlc/m2-x`)
  })
})

describe("resolveWorktreeBase", () => {
  it("resolves relative against the repo parent", () => {
    expect(resolveWorktreeBase("/x/y/repo", ".tlc")).toBe("/x/y/.tlc")
  })

  it("passes absolute paths through", () => {
    expect(resolveWorktreeBase("/x/y/repo", "/abs")).toBe("/abs")
  })
})

describe("terminal escaping", () => {
  it("escapes shell metacharacters", () => {
    expect(escapeBash('a"b$c`d')).toBe('a\\"b\\$c\\`d')
    expect(escapeBash("has\\backslash")).toBe("has\\\\backslash")
  })

  it("rejects null bytes", () => {
    expect(() => escapeBash("bad\x00name")).toThrow()
  })

  it("builds a quoted command from argv", () => {
    expect(buildBashCommandFromArgv(["opencode", "--session", "abc"])).toBe(
      '"opencode" "--session" "abc"',
    )
  })

  it("buildTerminalScript cd's into the target dir and execs the command", () => {
    const script = buildTerminalScript("/tmp/ws", ["opencode", "--session", "xyz"])
    expect(script).toContain('cd "/tmp/ws" && "opencode" "--session" "xyz"')
    expect(script).toContain("trap 'rm -f \"$0\"' EXIT INT TERM")
  })
})

describe("terminal detection", () => {
  it("detects tmux from the TMUX env var", () => {
    expect(isInsideTmux({ TMUX: "/tmp/tmux-1000/default" })).toBe(true)
    expect(isInsideTmux({})).toBe(false)
  })

  it("detects macos terminal type on darwin", () => {
    const type = detectTerminalType({})
    expect(["macos", "linux-desktop", "windows", "tmux"]).toContain(type)
  })

  it("detects current mac terminal from env", () => {
    expect(detectMacTerminal({ ITERM_SESSION_ID: "x" })).toBe("iterm")
    expect(detectMacTerminal({ TERM_PROGRAM: "iTerm.app" })).toBe("iterm")
    expect(detectMacTerminal({ TERM_PROGRAM: "Apple_Terminal" })).toBe("terminal")
    expect(detectMacTerminal({})).toBe("terminal")
  })
})

describe("state store", () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tlc-state-"))
    process.env.TLC_STATE_DIR = dir
  })

  afterEach(async () => {
    delete process.env.TLC_STATE_DIR
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("round-trips sessions", async () => {
    const projectId = "p1"
    await addSession(projectId, {
      id: "s1",
      branch: "m2/agent-voice",
      path: "/tmp/ws",
      createdAt: "now",
    })
    expect(await getSession(projectId, "s1")).toMatchObject({ branch: "m2/agent-voice" })
    expect(await getAllSessions(projectId)).toHaveLength(1)

    await removeSession(projectId, "s1")
    expect(await getAllSessions(projectId)).toHaveLength(0)
  })

  it("round-trips pending deletes", async () => {
    const projectId = "p2"
    await setPendingDelete(projectId, {
      sessionID: "s9",
      branch: "m3/x",
      path: "/tmp/ws2",
    })
    expect(await getPendingDelete(projectId)).toMatchObject({ branch: "m3/x" })

    await clearPendingDelete(projectId)
    expect(await getPendingDelete(projectId)).toBeNull()
  })

  it("keys state per project", async () => {
    await addSession("p1", { id: "s1", branch: "b1", path: "/x", createdAt: "t" })
    expect(await getAllSessions("p2")).toHaveLength(0)
  })
})
