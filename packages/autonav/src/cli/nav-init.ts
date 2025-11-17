#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { loadTemplates, replaceTemplateVars } from "../templates/index.js";

/**
 * nav-init CLI command
 *
 * Scaffolds a new navigator directory with config.json, CLAUDE.md, and knowledge-base/
 *
 * Usage:
 *   nav-init <directory-name> [description]
 */

function printUsage() {
  console.log(`
nav-init - Create a new Platform AI navigator

Usage:
  nav-init <navigator-name> [description]

Arguments:
  navigator-name    Name of the navigator directory to create (required)
  description       Description of what this navigator knows about (optional)

Examples:
  nav-init platform-navigator
  nav-init platform-navigator "Platform engineering knowledge base"
  nav-init aws-docs "AWS infrastructure documentation"

The command will create:
  <navigator-name>/
  ├── config.json          # Navigator configuration
  ├── CLAUDE.md           # System prompt and grounding rules
  ├── knowledge-base/     # Empty directory for documentation
  ├── .gitignore          # Git ignore file
  └── README.md           # Usage instructions
`);
}

function titleCase(str: string): string {
  return str
    .split(/[-_\s]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  const navigatorName = args[0];

  // Validate navigator name
  if (!navigatorName || navigatorName.startsWith("-")) {
    console.error("❌ Error: Navigator name is required\n");
    printUsage();
    process.exit(1);
  }

  const description =
    args.slice(1).join(" ") ||
    `Knowledge navigator for ${titleCase(navigatorName)}`;

  const navigatorPath = path.resolve(process.cwd(), navigatorName);

  // Check if directory already exists
  if (fs.existsSync(navigatorPath)) {
    console.error(`❌ Error: Directory already exists: ${navigatorPath}`);
    process.exit(1);
  }

  try {
    console.log(`\n🚀 Creating navigator: ${navigatorName}`);
    console.log(`📁 Location: ${navigatorPath}\n`);

    // Create directory structure
    fs.mkdirSync(navigatorPath, { recursive: true });
    fs.mkdirSync(path.join(navigatorPath, "knowledge-base"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(navigatorPath, ".claude"), {
      recursive: true,
    });

    // Load templates
    const templates = loadTemplates();

    // Prepare template variables
    const now = new Date().toISOString();
    const vars = {
      NAVIGATOR_NAME: navigatorName,
      NAVIGATOR_DESCRIPTION: description,
      DATE: now.split("T")[0] || now.substring(0, 10), // YYYY-MM-DD
      CREATED_AT: now,
      UPDATED_AT: now,
    };

    // Write files
    console.log("📝 Creating files...");

    fs.writeFileSync(
      path.join(navigatorPath, "config.json"),
      replaceTemplateVars(templates.configJson, vars)
    );
    console.log("  ✓ config.json");

    fs.writeFileSync(
      path.join(navigatorPath, "CLAUDE.md"),
      replaceTemplateVars(templates.claudeMd, vars)
    );
    console.log("  ✓ CLAUDE.md");

    fs.writeFileSync(
      path.join(navigatorPath, ".gitignore"),
      templates.gitignore
    );
    console.log("  ✓ .gitignore");

    fs.writeFileSync(
      path.join(navigatorPath, "README.md"),
      replaceTemplateVars(templates.readme, vars)
    );
    console.log("  ✓ README.md");

    fs.writeFileSync(
      path.join(navigatorPath, ".claude", "plugins.json"),
      templates.pluginsJson
    );
    console.log("  ✓ .claude/plugins.json");

    // Create a sample file in knowledge-base
    const sampleContent = `# Welcome to ${titleCase(navigatorName)}

This is a sample file to get you started.

## Getting Started

1. Add your documentation files to this directory
2. Organize them in subdirectories as needed
3. The navigator will search all files when answering questions

## Example Content

You can include:
- Markdown files (.md)
- Text files (.txt)
- Code snippets
- Configuration examples
- Troubleshooting guides

## Tips

- Use clear section headings
- Include code examples
- Keep docs up to date
- Use consistent formatting

---

*Remove this file and add your own documentation to get started.*
`;

    fs.writeFileSync(
      path.join(navigatorPath, "knowledge-base", "README.md"),
      sampleContent
    );
    console.log("  ✓ knowledge-base/README.md");

    console.log("\n✅ Navigator created successfully!\n");

    console.log("Next steps:");
    console.log(`  1. cd ${navigatorName}`);
    console.log("  2. Add your documentation to knowledge-base/");
    console.log(
      "  3. Query your navigator: npx nav-query . 'Your question here'\n"
    );

    console.log("💡 Tips:");
    console.log("  - Edit CLAUDE.md to customize the navigator's behavior");
    console.log("  - Check config.json for configuration options");
    console.log("  - Enable plugins in .claude/plugins.json (Slack, GitHub, file watcher)");
    console.log("  - See README.md for full usage instructions\n");
  } catch (error) {
    console.error(
      `\n❌ Error creating navigator: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

main();
