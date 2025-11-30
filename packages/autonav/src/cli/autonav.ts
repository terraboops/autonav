#!/usr/bin/env node

/**
 * Main autonav CLI dispatcher
 *
 * Routes commands to appropriate handlers:
 * - autonav init -> nav-init.ts
 * - autonav query -> nav-query.ts
 * - autonav chat -> nav-chat.ts
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
function getVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "unknown";
  } catch {
    return "unknown";
  }
}

function printUsage() {
  const version = getVersion();
  console.log(`
autonav v${version} - Autonomous Navigator CLI

Usage:
  autonav <command> [options]

Commands:
  init <name>     Create a new navigator
  query <path>    Query a navigator
  chat <path>     Interactive conversation with a navigator

Options:
  --help, -h      Show help
  --version, -v   Show version

Examples:
  autonav init my-navigator
  autonav init platform-nav --pack platform-engineering
  autonav init my-nav --from ./existing-repo
  autonav query ./my-navigator "How do I deploy?"
  autonav chat ./my-navigator

For command-specific help:
  autonav init --help
  autonav query --help
  autonav chat --help
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`autonav v${getVersion()}`);
    process.exit(0);
  }

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  let scriptPath: string;

  switch (command) {
    case "init":
      scriptPath = path.join(__dirname, "nav-init.js");
      break;
    case "query":
      scriptPath = path.join(__dirname, "nav-query.js");
      break;
    case "chat":
      scriptPath = path.join(__dirname, "nav-chat.js");
      break;
    default:
      console.error(`❌ Error: Unknown command: ${command}\n`);
      printUsage();
      process.exit(1);
  }

  // Spawn the appropriate command script
  const child = spawn(process.execPath, [scriptPath, ...commandArgs], {
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });

  child.on("error", (error) => {
    console.error(`❌ Error executing command: ${error.message}`);
    process.exit(1);
  });
}

main();
