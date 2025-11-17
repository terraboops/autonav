#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { loadTemplates, replaceTemplateVars } from "../templates/index.js";
import { validateNavigatorName } from "../validation/index.js";
import { installPack } from "../pack-installer/index.js";

/**
 * autonav init CLI command
 *
 * Scaffolds a new navigator directory with config.json, CLAUDE.md, and knowledge/
 *
 * Usage:
 *   autonav init <navigator-name> [options]
 */

interface InitOptions {
  pack?: string;
  server?: string;
  packFile?: string;
  force?: boolean;
  quiet?: boolean;
}

function printUsage() {
  console.log(`
autonav init - Create a new Platform AI navigator

Usage:
  autonav init <navigator-name> [options]

Arguments:
  navigator-name    Name of the navigator directory to create (required)

Options:
  --pack <name>       Install knowledge pack by name
  --server <url>      Custom pack server URL (default: configured server)
  --pack-file <path>  Install pack from local file (for development)
  --force             Overwrite existing directory
  --quiet             Minimal output

Examples:
  # Create basic navigator
  autonav init my-navigator

  # Create navigator with knowledge pack
  autonav init platform-nav --pack platform-engineering

  # Use custom pack server
  autonav init nav --pack my-pack --server https://my-server.com

  # Install from local pack file
  autonav init nav --pack-file ./my-pack-0.1.0.tar.gz

The command will create:
  <navigator-name>/
  ├── config.json                    # Navigator configuration
  ├── CLAUDE.md                      # System prompt and grounding rules
  ├── knowledge/                     # Directory for documentation
  ├── .claude/
  │   └── plugins.json              # Plugin configuration
  ├── .gitignore                     # Git ignore file
  └── README.md                      # Usage instructions

With --pack option, it will also install:
  ├── system-configuration.md        # Pack-specific configuration
  └── knowledge/                     # Pre-populated knowledge files
`);
}

function titleCase(str: string): string {
  return str
    .split(/[-_\s]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseArgs(args: string[]): {
  navigatorName?: string;
  options: InitOptions;
} {
  const options: InitOptions = {};
  let navigatorName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg) continue;

    if (arg === "--pack" && i + 1 < args.length) {
      options.pack = args[++i];
    } else if (arg === "--server" && i + 1 < args.length) {
      options.server = args[++i];
    } else if (arg === "--pack-file" && i + 1 < args.length) {
      options.packFile = args[++i];
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (!arg.startsWith("-")) {
      navigatorName = arg;
    }
  }

  return { navigatorName, options };
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  const { navigatorName, options } = parseArgs(args);

  // Validate navigator name
  if (!navigatorName) {
    console.error("❌ Error: Navigator name is required\n");
    printUsage();
    process.exit(1);
  }

  const validation = validateNavigatorName(navigatorName);
  if (!validation.valid) {
    console.error(`❌ Error: ${validation.error}\n`);
    process.exit(1);
  }

  const navigatorPath = path.resolve(process.cwd(), navigatorName);

  // Check if directory already exists
  if (fs.existsSync(navigatorPath)) {
    if (!options.force) {
      console.error(`❌ Error: Directory already exists: ${navigatorPath}`);
      console.error("Use --force to overwrite\n");
      process.exit(1);
    }
    // Remove existing directory if --force is specified
    if (!options.quiet) {
      console.log(`⚠️  Removing existing directory: ${navigatorPath}`);
    }
    fs.rmSync(navigatorPath, { recursive: true, force: true });
  }

  try {
    if (!options.quiet) {
      console.log(`\nCreating navigator: ${navigatorName}`);
    }

    // Create directory structure
    fs.mkdirSync(navigatorPath, { recursive: true });
    fs.mkdirSync(path.join(navigatorPath, "knowledge"), { recursive: true });
    fs.mkdirSync(path.join(navigatorPath, ".claude"), { recursive: true });

    if (!options.quiet) {
      console.log("✓ Created directory structure");
    }

    // Load templates
    const templates = loadTemplates();

    // Handle knowledge pack installation if requested
    let packMetadata: { name: string; version: string } | null = null;

    if (options.pack || options.packFile) {
      if (!options.quiet) {
        console.log(
          options.packFile
            ? `✓ Installing pack from file: ${path.basename(options.packFile)}`
            : `✓ Downloading knowledge pack: ${options.pack}`
        );
      }

      try {
        const result = await installPack({
          packName: options.pack,
          packServer: options.server,
          packFile: options.packFile,
          targetDir: navigatorPath,
          onProgress: options.quiet
            ? undefined
            : (msg) => console.log(`  ${msg}`),
        });

        packMetadata = {
          name: result.metadata.name,
          version: result.metadata.version,
        };

        if (!options.quiet) {
          console.log(
            `✓ Installed knowledge pack: ${packMetadata.name} v${packMetadata.version}`
          );
          if (result.installedFiles.length > 0) {
            const knowledgeFiles = result.installedFiles.filter((f) =>
              f.startsWith("knowledge/")
            );
            if (knowledgeFiles.length > 0) {
              // Show first few files
              const displayFiles = knowledgeFiles.slice(0, 3);
              const more = knowledgeFiles.length - displayFiles.length;
              console.log(
                `✓ Installed knowledge files (${knowledgeFiles.length} documents)`
              );
              console.log(
                `  ${displayFiles.map((f) => path.basename(f)).join(", ")}${more > 0 ? `, +${more} more` : ""}`
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `\n❌ Error installing pack: ${error instanceof Error ? error.message : String(error)}\n`
        );
        // Clean up on pack installation failure
        fs.rmSync(navigatorPath, { recursive: true, force: true });
        process.exit(1);
      }
    }

    // Prepare template variables
    const now = new Date().toISOString();
    const description = `Knowledge navigator for ${titleCase(navigatorName)}`;
    const vars: Record<string, string> = {
      NAVIGATOR_NAME: navigatorName,
      NAVIGATOR_DESCRIPTION: description,
      DATE: now.split("T")[0] || now.substring(0, 10), // YYYY-MM-DD
      CREATED_AT: now,
      UPDATED_AT: now,
      PACK_NAME: packMetadata?.name || "",
      PACK_VERSION: packMetadata?.version || "",
    };

    // Write config.json (use pack template if pack was installed)
    const configTemplate = packMetadata
      ? templates.configJsonPack
      : templates.configJson;
    fs.writeFileSync(
      path.join(navigatorPath, "config.json"),
      replaceTemplateVars(configTemplate, vars)
    );
    if (!options.quiet) {
      console.log("✓ Generated config.json");
    }

    // Write CLAUDE.md (use pack template if pack was installed)
    const claudeTemplate = packMetadata ? templates.claudeMdPack : templates.claudeMd;
    fs.writeFileSync(
      path.join(navigatorPath, "CLAUDE.md"),
      replaceTemplateVars(claudeTemplate, vars)
    );
    if (!options.quiet) {
      console.log("✓ Created CLAUDE.md template");
    }

    // Write system-configuration.md if pack-based and not already created by pack
    if (
      packMetadata &&
      !fs.existsSync(path.join(navigatorPath, "system-configuration.md"))
    ) {
      fs.writeFileSync(
        path.join(navigatorPath, "system-configuration.md"),
        replaceTemplateVars(templates.systemConfiguration, vars)
      );
      if (!options.quiet) {
        console.log("✓ Created system-configuration.md");
      }
    }

    // Write .claude/plugins.json (if not already created by pack)
    const pluginsPath = path.join(navigatorPath, ".claude", "plugins.json");
    if (!fs.existsSync(pluginsPath)) {
      fs.writeFileSync(pluginsPath, templates.pluginsJson);
    }
    if (!options.quiet) {
      console.log("✓ Configured plugins.json");
    }

    // Write .gitignore
    fs.writeFileSync(path.join(navigatorPath, ".gitignore"), templates.gitignore);
    if (!options.quiet) {
      console.log("✓ Created .gitignore");
    }

    // Write README.md
    fs.writeFileSync(
      path.join(navigatorPath, "README.md"),
      replaceTemplateVars(templates.readme, vars)
    );

    // Create starter README in knowledge/ if no pack was installed
    if (!packMetadata) {
      const starterReadme = `# Welcome to ${titleCase(navigatorName)}

This is your knowledge base directory. Add your documentation files here.

## Getting Started

1. Add your documentation files to this directory
2. Organize them in subdirectories as needed
3. The navigator will search all files when answering questions

## Supported File Types

- Markdown files (.md)
- Text files (.txt)
- Code files
- Configuration files

## Tips for Good Documentation

- Use clear section headings
- Include examples and code snippets
- Keep documentation up to date
- Use consistent formatting
- Add context and explanations

---

*Remove this file and add your own documentation to get started.*
`;

      fs.writeFileSync(
        path.join(navigatorPath, "knowledge", "README.md"),
        starterReadme
      );
    }

    if (!options.quiet) {
      console.log("✓ Navigator ready at ./" + navigatorName);

      console.log("\nNext steps:");
      console.log(`  cd ${navigatorName}`);
      if (!packMetadata) {
        console.log("  # Add knowledge files to knowledge/ directory");
        console.log("  # Edit CLAUDE.md to customize behavior");
      }
      console.log(`  autonav query ${navigatorName} "test question"\n`);
    } else {
      // Minimal output for quiet mode
      console.log(`✓ Created navigator: ${navigatorName}`);
    }
  } catch (error) {
    console.error(
      `\n❌ Error creating navigator: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

main();
