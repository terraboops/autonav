#!/usr/bin/env node

import { KnowledgePackServer } from "./server.js";
import { existsSync } from "fs";
import { resolve } from "path";

const DEFAULT_PORT = 3000;
const DEFAULT_PACKS_DIR = "./packs";

function printUsage(): void {
  console.log(`
Knowledge Pack Server v1.0.0
Reference HTTP server for Autonav knowledge pack distribution

Usage:
  pack-server [options]

Options:
  --port <number>       Port to listen on (default: ${DEFAULT_PORT})
  --packs-dir <path>    Directory containing packs (default: ${DEFAULT_PACKS_DIR})
  --help                Show this help message

Environment Variables:
  PORT                  Port to listen on (overridden by --port)
  PACKS_DIR             Packs directory (overridden by --packs-dir)

Examples:
  pack-server
  pack-server --port 8080
  pack-server --packs-dir /var/packs
  PORT=8080 pack-server

Directory Structure:
  packs/
  ├── platform-engineering/
  │   ├── 1.0.0/
  │   │   ├── platform-engineering-1.0.0.tar.gz
  │   │   └── metadata.json
  │   └── 1.1.0/
  │       ├── platform-engineering-1.1.0.tar.gz
  │       └── metadata.json
  └── aws-navigator/
      └── 1.0.0/
          ├── aws-navigator-1.0.0.tar.gz
          └── metadata.json

Endpoints:
  GET /health
  GET /packs/{pack-name}/latest
  GET /packs/{pack-name}/versions
  GET /packs/{pack-name}/metadata
  GET /packs/{pack-name}/{version}

Documentation:
  See docs/KNOWLEDGE_PACK_PROTOCOL.md for full protocol specification
`);
}

function parseArgs(): { port: number; packsDir: string } {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || String(DEFAULT_PORT));
  let packsDir = process.env.PACKS_DIR || DEFAULT_PACKS_DIR;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--port" || arg === "-p") {
      const portArg = args[++i];
      if (!portArg) {
        console.error("Error: --port requires a port number");
        process.exit(1);
      }
      const parsed = parseInt(portArg);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Error: Invalid port number: ${portArg}`);
        process.exit(1);
      }
      port = parsed;
    } else if (arg === "--packs-dir" || arg === "-d") {
      const packsDirArg = args[++i];
      if (!packsDirArg) {
        console.error("Error: --packs-dir requires a directory path");
        process.exit(1);
      }
      packsDir = packsDirArg;
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return { port, packsDir };
}

function main(): void {
  const { port, packsDir } = parseArgs();
  const resolvedPacksDir = resolve(packsDir);

  console.log("Knowledge Pack Server v1.0.0");
  console.log("Protocol: knowledge-pack/1.0.0");
  console.log();

  if (!existsSync(resolvedPacksDir)) {
    console.error(`Error: Packs directory does not exist: ${resolvedPacksDir}`);
    console.error();
    console.error("Create the directory and add packs:");
    console.error(`  mkdir -p ${resolvedPacksDir}`);
    console.error(`  cp -r your-pack/ ${resolvedPacksDir}/`);
    process.exit(1);
  }

  const server = new KnowledgePackServer(resolvedPacksDir);

  server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`Packs directory: ${resolvedPacksDir}`);
    console.log();
    console.log("Endpoints:");
    console.log(`  GET http://localhost:${port}/health`);
    console.log(`  GET http://localhost:${port}/packs/{pack-name}/latest`);
    console.log(`  GET http://localhost:${port}/packs/{pack-name}/versions`);
    console.log(`  GET http://localhost:${port}/packs/{pack-name}/metadata`);
    console.log(`  GET http://localhost:${port}/packs/{pack-name}/{version}`);
    console.log();
    console.log("Press Ctrl+C to stop");
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\nShutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\nShutting down gracefully...");
    process.exit(0);
  });
}

main();
