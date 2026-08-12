#!/usr/bin/env node
/**
 * postinstall: place the companion `tlc-branching` skill into the user's
 * skills directory so it is discoverable by opencode.
 *
 * Target defaults to ~/.agents/skills (matching where the user keeps skills);
 * override with TLC_SKILL_DIR. Best-effort — never fails the install.
 */
const { existsSync, mkdirSync, copyFileSync } = require("node:fs")
const { homedir } = require("node:os")
const { join, resolve } = require("node:path")

const SKILL_NAME = "tlc-branching"

function main() {
  const source = resolve(__dirname, "..", "skill", SKILL_NAME, "SKILL.md")
  if (!existsSync(source)) {
    console.warn(`[tlc] skill source not found at ${source}; skipping`)
    return
  }

  const baseDir = process.env.TLC_SKILL_DIR || join(homedir(), ".agents", "skills")
  const destDir = join(baseDir, SKILL_NAME)
  const dest = join(destDir, "SKILL.md")

  try {
    mkdirSync(destDir, { recursive: true })
    copyFileSync(source, dest)
    console.log(`[tlc] installed skill tlc-branching → ${dest}`)
  } catch (error) {
    console.warn(`[tlc] failed to install skill: ${error.message}`)
  }
}

main()
