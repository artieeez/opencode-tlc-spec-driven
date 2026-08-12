#!/usr/bin/env node
/**
 * postinstall: place companion skills into the user's skills directory so they
 * are discoverable by opencode.
 *
 * Target defaults to ~/.agents/skills (matching where the user keeps skills);
 * override with TLC_SKILL_DIR. Best-effort — never fails the install.
 * Existing copies of a skill are replaced (migration-safe).
 */
const { existsSync, mkdirSync, cpSync, rmSync } = require("node:fs")
const { homedir } = require("node:os")
const { join, resolve } = require("node:path")

const SKILLS_SRC = resolve(__dirname, "..", "skill")
const SKILLS = ["tlc-branching", "tlc-create-pr"]

function main() {
  const baseDir = process.env.TLC_SKILL_DIR || join(homedir(), ".agents", "skills")

  for (const name of SKILLS) {
    const source = join(SKILLS_SRC, name)
    if (!existsSync(join(source, "SKILL.md"))) {
      console.warn(`[tlc] skill source not found at ${source}; skipping`)
      continue
    }

    const dest = join(baseDir, name)
    try {
      mkdirSync(baseDir, { recursive: true })
      rmSync(dest, { recursive: true, force: true })
      cpSync(source, dest, { recursive: true })
      console.log(`[tlc] installed skill ${name} → ${dest}`)
    } catch (error) {
      console.warn(`[tlc] failed to install skill ${name}: ${error.message}`)
    }
  }
}

main()
