/**
 * Terminal launch helpers (pattern from opencode-worktree).
 *
 * Opens a new terminal window/tab in `cwd` running an argv command. The command
 * is written to a self-deleting temp script so detached terminal processes can
 * read it without racing cleanup, and args are passed through array-based spawn
 * (no shell interpolation).
 */

import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

export type TerminalType = "tmux" | "macos" | "linux-desktop" | "windows"

export type TerminalResult = { success: true } | { success: false; error: string }

export function isInsideTmux(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.TMUX)
}

export function getTempDir(): string {
  return fs.realpathSync.native(os.tmpdir())
}

export function assertShellSafe(value: string, context: string): void {
  if (/[\x00]/.test(value)) {
    throw new Error(`${context} contains null bytes which cannot be safely escaped`)
  }
}

export function escapeBash(str: string): string {
  assertShellSafe(str, "Bash argument")
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
}

export function buildBashCommandFromArgv(argv?: string[]): string | undefined {
  if (!argv || argv.length === 0) return undefined
  return argv.map((arg) => `"${escapeBash(arg)}"`).join(" ")
}

function wrapWithSelfCleanup(script: string): string {
  return `#!/bin/bash
trap 'rm -f "$0"' EXIT INT TERM
${script}`
}

export function buildTerminalScript(cwd: string, argv?: string[]): string {
  const escapedCwd = escapeBash(cwd)
  const command = buildBashCommandFromArgv(argv)
  return wrapWithSelfCleanup(
    command ? `cd "${escapedCwd}" && ${command}\nexec bash` : `cd "${escapedCwd}"\nexec bash`,
  )
}

function escapeAppleScript(str: string): string {
  assertShellSafe(str, "AppleScript argument")
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, " ")
}

async function writeScript(cwd: string, argv?: string[]): Promise<string> {
  const scriptPath = path.join(
    getTempDir(),
    `tlc-worktree-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`,
  )
  await Bun.write(scriptPath, buildTerminalScript(cwd, argv))
  await fsPromises.chmod(scriptPath, 0o755)
  return scriptPath
}

/** Detect the current macOS terminal from env vars (most reliable first). */
export function detectMacTerminal(
  env: Record<string, string | undefined> = process.env,
): "ghostty" | "iterm" | "kitty" | "alacritty" | "warp" | "terminal" {
  if (env.GHOSTTY_RESOURCES_DIR) return "ghostty"
  if (env.ITERM_SESSION_ID) return "iterm"
  if (env.KITTY_WINDOW_ID) return "kitty"
  if (env.ALACRITTY_WINDOW_ID) return "alacritty"
  if (env.__CFBundleIdentifier === "dev.warp.Warp-Stable") return "warp"

  switch ((env.TERM_PROGRAM ?? "").toLowerCase()) {
    case "ghostty":
      return "ghostty"
    case "iterm.app":
      return "iterm"
    case "warpterm":
      return "warp"
    case "apple_terminal":
      return "terminal"
  }
  return "terminal"
}

export function detectTerminalType(
  env: Record<string, string | undefined> = process.env,
): TerminalType {
  if (isInsideTmux(env)) return "tmux"
  switch (process.platform) {
    case "darwin":
      return "macos"
    case "win32":
      return "windows"
    default:
      return "linux-desktop"
  }
}

async function openTmuxWindow(cwd: string, argv?: string[]): Promise<TerminalResult> {
  try {
    const args = ["new-window", "-c", cwd]
    if (argv?.length) {
      const scriptPath = await writeScript(cwd, argv)
      args.push("--", "bash", scriptPath)
    }
    const proc = Bun.spawn(["tmux", ...args], { stdout: "ignore", stderr: "pipe" })
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
    if (exitCode !== 0) return { success: false, error: `tmux: ${stderr.trim()}` }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function openMacOSTerminal(cwd: string, argv?: string[]): Promise<TerminalResult> {
  const scriptPath = await writeScript(cwd, argv)
  const terminal = detectMacTerminal()

  try {
    switch (terminal) {
      case "ghostty": {
        const escaped = escapeBash(cwd)
        const command = buildBashCommandFromArgv(argv)
        const proc = Bun.spawn(
          [
            "open",
            "-na",
            "Ghostty.app",
            "--args",
            `--working-directory=${cwd}`,
            "-e",
            "bash",
            "-c",
            command ? `cd "${escaped}" && ${command}` : `cd "${escaped}"`,
          ],
          { detached: true, stdio: ["ignore", "ignore", "ignore"] },
        )
        proc.unref()
        await fsPromises.rm(scriptPath).catch(() => {})
        return { success: true }
      }
      case "iterm": {
        const escapedPath = escapeAppleScript(scriptPath)
        const appleScript = `
          tell application "iTerm"
            if not (exists window 1) then
              reopen
            else
              tell current window
                create tab with default profile
              end tell
            end if
            activate
            tell first session of current tab of current window
              write text "${escapedPath}"
            end tell
          end tell`
        const result = Bun.spawnSync(["osascript", "-e", appleScript])
        if (result.exitCode !== 0) {
          await fsPromises.rm(scriptPath).catch(() => {})
          return { success: false, error: `iTerm AppleScript failed: ${result.stderr.toString()}` }
        }
        return { success: true }
      }
      case "kitty": {
        const proc = Bun.spawn(["kitty", "--directory", cwd, "-e", "bash", scriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        })
        proc.unref()
        return { success: true }
      }
      case "alacritty": {
        const proc = Bun.spawn(
          ["alacritty", "--working-directory", cwd, "-e", "bash", scriptPath],
          { detached: true, stdio: ["ignore", "ignore", "ignore"] },
        )
        proc.unref()
        return { success: true }
      }
      case "warp": {
        const proc = Bun.spawn(["open", "-b", "dev.warp.Warp-Stable", scriptPath], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        })
        proc.unref()
        return { success: true }
      }
      default: {
        // Terminal.app — waits for completion, safe to remove script after.
        const proc = Bun.spawn(["open", "-a", "Terminal", scriptPath], {
          stdio: ["ignore", "ignore", "pipe"],
        })
        const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
        if (exitCode !== 0) {
          await fsPromises.rm(scriptPath).catch(() => {})
          return { success: false, error: `Failed to open Terminal: ${stderr.trim()}` }
        }
        return { success: true }
      }
    }
  } catch (error) {
    await fsPromises.rm(scriptPath).catch(() => {})
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function openLinuxTerminal(cwd: string, argv?: string[]): Promise<TerminalResult> {
  const scriptPath = await writeScript(cwd, argv)
  const candidates: string[][] = [
    ["xdg-terminal-exec", "bash", scriptPath],
    ["x-terminal-emulator", "-e", "bash", scriptPath],
    ["gnome-terminal", "--working-directory", cwd, "--", "bash", scriptPath],
    ["konsole", "--workdir", cwd, "-e", "bash", scriptPath],
    ["kitty", "--directory", cwd, "-e", "bash", scriptPath],
    ["alacritty", "--working-directory", cwd, "-e", "bash", scriptPath],
    ["xterm", "-e", "bash", scriptPath],
  ]
  for (const candidate of candidates) {
    try {
      const which = Bun.spawnSync(["which", candidate[0]], { stdout: "pipe", stderr: "pipe" })
      if (which.exitCode !== 0) continue
      const proc = Bun.spawn(candidate, { detached: true, stdio: ["ignore", "ignore", "ignore"] })
      proc.unref()
      return { success: true }
    } catch {
      // try next candidate
    }
  }
  await fsPromises.rm(scriptPath).catch(() => {})
  return { success: false, error: "No terminal emulator found" }
}

async function openWindowsTerminal(cwd: string, argv?: string[]): Promise<TerminalResult> {
  const scriptPath = await writeScript(cwd, argv)
  try {
    const wt = Bun.spawnSync(["where", "wt"], { stdout: "pipe", stderr: "pipe" })
    if (wt.exitCode === 0) {
      const proc = Bun.spawn(["wt.exe", "-d", cwd, "bash", scriptPath], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      })
      proc.unref()
      return { success: true }
    }
    const proc = Bun.spawn(["cmd", "/c", "start", "", scriptPath], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    })
    proc.unref()
    return { success: true }
  } catch (error) {
    await fsPromises.rm(scriptPath).catch(() => {})
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Open a new terminal window/tab in `cwd` running `argv`.
 * Auto-detects the terminal (tmux > platform default).
 */
export async function openTerminal(
  cwd: string,
  argv?: string[],
  windowName?: string,
): Promise<TerminalResult> {
  switch (detectTerminalType()) {
    case "tmux":
      return openTmuxWindow(cwd, argv)
    case "macos":
      return openMacOSTerminal(cwd, argv)
    case "windows":
      return openWindowsTerminal(cwd, argv)
    case "linux-desktop":
      return openLinuxTerminal(cwd, argv)
  }
}
