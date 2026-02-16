#!/usr/bin/env node

/**
 * Main autonav CLI dispatcher
 *
 * Routes commands to appropriate handlers via dynamic import (same process).
 * Each command module exports a `run(args: string[])` function.
 */

import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json, append -dev if running from a linked/local install
function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const version = packageJson.version || "unknown";

    // Detect linked install: check if our path is inside a node_modules symlink
    // or if we're running directly from a source/dev directory
    const realPath = fs.realpathSync(__filename);
    const isLinked = !realPath.includes("node_modules") ||
      realPath !== __filename; // symlinked
    return isLinked ? `${version}-dev` : version;
  } catch {
    return "unknown";
  }
}

function printUsage(): void {
  const version = getVersion();
  console.log(`
autonav v${version} - Autonomous Navigator CLI

Usage:
  autonav <command> [options]

Commands:
  init <name>       Create a new navigator
  query <path>      Query a navigator
  update <path>     Update a navigator's documentation
  chat <path>       Interactive conversation with a navigator
  migrate <path>    Migrate a navigator to latest version
  mend <path>       Health check and repair for navigators
  memento <code> <nav>  Iterative development loop (nav plans, worker implements)
  standup <nav1> <nav2> [...]  Multi-navigator standup sync
  install [path]    Symlink local skills to global location
  uninstall [path]  Remove global skill symlinks (preserves local)

Options:
  --help, -h      Show help
  --version, -v   Show version

Examples:
  autonav init my-navigator
  autonav init platform-nav --pack platform-engineering
  autonav init my-nav --from ./existing-repo
  autonav query ./my-navigator "How do I deploy?"
  autonav update ./my-navigator "I completed feature X. Please document this."
  autonav chat ./my-navigator
  autonav migrate ./my-navigator
  autonav mend ./my-navigator --auto-fix
  autonav memento ./my-app ./my-nav --task "Add auth" --branch feature/auth
  autonav standup ./nav-a ./nav-b --verbose
  autonav install ./my-navigator
  autonav uninstall ./my-navigator

For command-specific help:
  autonav init --help
  autonav query --help
  autonav update --help
  autonav chat --help
  autonav migrate --help
  autonav mend --help
  autonav memento --help
  autonav standup --help
  autonav install --help
  autonav uninstall --help
`);
}

/** Valid command names that map to nav-<command>.js modules */
const COMMANDS = new Set([
  "init", "query", "update", "chat", "migrate",
  "mend", "memento", "standup", "install", "uninstall",
]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show version only if --version/-v is first arg (before any command)
  if (args[0] === "--version" || args[0] === "-v") {
    console.log(`autonav v${getVersion()}`);
    process.exit(0);
  }

  // Show main help only if no command or --help/-h is first arg
  // (subcommands handle their own --help)
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  const commandArgs = args.slice(1);

  if (!COMMANDS.has(command)) {
    console.error(`Error: Unknown command: ${command}\n`);
    printUsage();
    process.exit(1);
  }

  try {
    const mod = await import(`./nav-${command}.js`);
    await mod.run(commandArgs);
  } catch (error) {
    // Don't double-report errors from commands that already called process.exit()
    // If we get here, it's an unexpected error (import failure, missing run(), etc.)
    console.error(`❌ Error executing command: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
