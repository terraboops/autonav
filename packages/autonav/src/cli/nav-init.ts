#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { loadTemplates, replaceTemplateVars } from "../templates/index.js";
import { validateNavigatorName } from "../validation/index.js";
import { installPack } from "../pack-installer/index.js";
import {
  runInterviewTUI,
  isInteractiveTerminal,
  hasProgress,
  loadProgress,
  clearProgress,
  getProgressSummary,
  type NavigatorConfig,
  type PackContext,
  type InterviewProgress,
} from "../interview/index.js";
import { scanRepository } from "../repo-scanner/index.js";
import { analyzeRepository, type AnalysisResult } from "../repo-analyzer/index.js";
import {
  confirmAnalysis,
  promptExistingClaudeMd,
  checkFileConflicts,
  type ExistingClaudeMdAction,
} from "../confirmation/index.js";
import { createAndSymlinkSkill } from "../skill-generator/index.js";

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
  from?: string;
  inPlace?: boolean;
  force?: boolean;
  quiet?: boolean;
  quick?: boolean;
}

function printUsage() {
  console.log(`
autonav init - Create a new Platform AI navigator

Usage:
  autonav init <navigator-name> [options]

Arguments:
  navigator-name    Name of the navigator directory to create (required)

Options:
  --pack <name|url>   Install knowledge pack by name, URL, or GitHub path
  --server <url>      Custom pack server URL (default: configured server)
  --pack-file <path>  Install pack from local file (for development)
  --from, -f <path>   Import existing repository as knowledge base
                      Scans repo, analyzes with Claude, confirms with user
  --in-place          With --from: add config files directly to source repo
                      If CLAUDE.md exists, prompts: integrate/overwrite/skip
  --force             Overwrite existing files without prompting
  --quiet             Minimal output
  --quick             Skip interactive interview, use defaults

Examples:
  # Create basic navigator
  autonav init my-navigator

  # Import existing repository as knowledge base
  autonav init my-nav --from /path/to/existing/repo

  # Import in-place (add files to existing repo)
  autonav init my-nav --from /path/to/repo --in-place

  # Import repository in-place (no navigator name)
  autonav init --from /path/to/repo

  # Create navigator with knowledge pack from server
  autonav init platform-nav --pack platform-engineering

  # Install from GitHub folder (full URL)
  autonav init nav --pack https://github.com/owner/repo/tree/main/packs/my-pack

  # Install from GitHub folder (shorthand)
  autonav init nav --pack github:owner/repo/packs/my-pack

  # Install from GitHub via SSH (uses your SSH keys)
  autonav init nav --pack git@github.com:owner/repo/packs/my-pack

  # Install specific version from GitHub
  autonav init nav --pack github:owner/repo/packs/my-pack@v1.0.0

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

With --from option:
  - Scans repository structure and documentation
  - Analyzes content with Claude to infer purpose/scope/audience
  - Confirms analysis with user (Y/n/edit)
  - Creates navigator with knowledge base pointing to source

With --from --in-place and existing CLAUDE.md:
  - [i] Integrate: Append autonav section to existing file
  - [o] Overwrite: Replace with full autonav template
  - [s] Skip: Keep existing CLAUDE.md unchanged (default)
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
    } else if ((arg === "--from" || arg === "-f") && i + 1 < args.length) {
      options.from = args[++i];
    } else if (arg === "--in-place") {
      options.inPlace = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--quick") {
      options.quick = true;
    } else if (!arg.startsWith("-")) {
      navigatorName = arg;
    }
  }

  // Infer in-place mode if --from present but no name
  if (options.from && !navigatorName) {
    options.inPlace = true;
  }

  return { navigatorName, options };
}

/**
 * Prompt user if they want to resume from saved progress
 */
async function promptResumeProgress(
  progress: InterviewProgress
): Promise<boolean> {
  const summary = getProgressSummary(progress);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`\n${summary}`);
    rl.question("Resume from saved progress? [Y/n] ", (answer) => {
      rl.close();
      const shouldResume = !answer || answer.toLowerCase() === "y";
      resolve(shouldResume);
    });
  });
}

/**
 * Handle import mode (--from flag)
 * Scans an existing repository and creates a navigator that uses it as knowledge base
 */
async function handleImportMode(
  navigatorName: string,
  options: InitOptions
): Promise<void> {
  const sourcePath = path.resolve(options.from!);

  // Validate source path
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Error: Source path does not exist: ${sourcePath}\n`);
    process.exit(1);
  }
  if (!fs.statSync(sourcePath).isDirectory()) {
    console.error(`❌ Error: Source path is not a directory: ${sourcePath}\n`);
    process.exit(1);
  }

  // Determine output path
  const navigatorPath = options.inPlace
    ? sourcePath
    : path.resolve(process.cwd(), navigatorName);

  // Pre-scan conflict detection
  if (!options.force) {
    const { shouldContinue } = await checkFileConflicts(
      navigatorPath,
      options.inPlace || false
    );
    if (!shouldContinue) {
      console.log("\n❌ Import cancelled.\n");
      process.exit(0);
    }
  }

  // Check for existing CLAUDE.md in source repo (only relevant for in-place mode)
  const existingClaudeMdPath = path.join(sourcePath, "CLAUDE.md");
  const hasExistingClaudeMd = fs.existsSync(existingClaudeMdPath);
  let claudeMdAction: ExistingClaudeMdAction = "overwrite"; // Default for new navigators

  // Only prompt about existing CLAUDE.md in in-place mode
  // In non-in-place mode, we always create a fresh navigator directory with its own CLAUDE.md
  if (options.inPlace && hasExistingClaudeMd && !options.force) {
    claudeMdAction = await promptExistingClaudeMd();
  }

  // Check for existing navigator directory (non-in-place mode)
  // If we got this far, user confirmed they want to overwrite
  if (!options.inPlace && fs.existsSync(navigatorPath)) {
    if (!options.quiet) {
      console.log(`⚠️  Removing existing directory: ${navigatorPath}`);
    }
    fs.rmSync(navigatorPath, { recursive: true, force: true });
  }

  try {
    if (!options.quiet) {
      console.log(`\nImporting repository: ${sourcePath}`);
      console.log("Scanning repository...");
    }

    // Phase 1: Scan repository
    const scanResult = await scanRepository(sourcePath);

    if (!options.quiet) {
      console.log(`✓ Scanned ${scanResult.stats.scannedFiles}/${scanResult.stats.totalFiles} files (${scanResult.stats.strategy} strategy)`);
      if (scanResult.warnings.length > 0) {
        for (const warning of scanResult.warnings) {
          console.log(`⚠️  ${warning}`);
        }
      }
      console.log("Analyzing repository...");
    }

    // Phase 2: Analyze with Claude
    const analysis = await analyzeRepository(scanResult);

    if (!options.quiet) {
      console.log("✓ Analysis complete");
    }

    // Phase 3: Confirm with user
    const confirmation = await confirmAnalysis(analysis, scanResult.stats);

    if (confirmation.action === "abort") {
      console.log("\n❌ Import cancelled.\n");
      process.exit(0);
    }

    let finalAnalysis: AnalysisResult;

    if (confirmation.action === "edit") {
      // Fall back to interview with pre-filled context
      if (!isInteractiveTerminal()) {
        console.error("❌ Error: Cannot edit in non-interactive terminal\n");
        process.exit(1);
      }

      console.log("\nStarting interview to customize configuration...\n");
      const interviewConfig = await runInterviewTUI(navigatorName, {
        navigatorPath,
        analysisContext: analysis,
      });

      // Convert interview config to analysis result format
      finalAnalysis = {
        purpose: interviewConfig.purpose || analysis.purpose,
        scope: interviewConfig.scope || analysis.scope,
        audience: interviewConfig.audience || analysis.audience,
        suggestedKnowledgePaths: analysis.suggestedKnowledgePaths,
        confidence: 1.0, // User confirmed
      };
    } else {
      finalAnalysis = confirmation.analysis;
    }

    // Final validation before file generation
    const { validateAnalysisResult } = await import(
      "../repo-analyzer/index.js"
    );
    finalAnalysis = validateAnalysisResult(finalAnalysis, navigatorName);

    // Phase 4: Generate navigator files
    if (!options.inPlace) {
      fs.mkdirSync(navigatorPath, { recursive: true });
      fs.mkdirSync(path.join(navigatorPath, ".claude"), { recursive: true });
    } else {
      // Ensure .claude directory exists for in-place
      fs.mkdirSync(path.join(navigatorPath, ".claude"), { recursive: true });
    }

    // Create symlink to source repository as 'knowledge' directory
    if (!options.inPlace) {
      const knowledgeSymlink = path.join(navigatorPath, "knowledge");
      const symlinkType = os.platform() === "win32" ? "junction" : "dir";

      try {
        fs.symlinkSync(sourcePath, knowledgeSymlink, symlinkType);
        if (!options.quiet) {
          console.log(`✓ Created knowledge symlink → ${sourcePath}`);
        }
      } catch (error) {
        // Fallback: warn but continue (symlink creation may fail due to permissions)
        console.warn(
          `⚠️  Could not create symlink: ${error instanceof Error ? error.message : String(error)}`
        );
        console.warn(`   Knowledge base will reference: ${sourcePath}`);
      }
    }

    // Load templates
    const templates = loadTemplates();

    // Prepare template variables
    const now = new Date().toISOString();
    const knowledgePathsList = finalAnalysis.suggestedKnowledgePaths
      .map((p) => `- ${p}`)
      .join("\n");

    // Build navigator context section for imported repos
    const navigatorContext = `
## About This Navigator

**Purpose**: ${finalAnalysis.purpose}

**Scope**: ${finalAnalysis.scope}

**Audience**: ${finalAnalysis.audience}

`;

    // Build knowledge paths section
    const knowledgePathsSection = knowledgePathsList
      ? `\nFocus on these paths for documentation:\n${knowledgePathsList}\n\n`
      : "\n";

    const vars: Record<string, string> = {
      NAVIGATOR_NAME: navigatorName,
      NAVIGATOR_DESCRIPTION: finalAnalysis.purpose,
      NAVIGATOR_CONTEXT: navigatorContext,
      KNOWLEDGE_BASE_PATH: options.inPlace ? "." : sourcePath,
      KNOWLEDGE_PATHS_SECTION: knowledgePathsSection,
      DOMAIN_SCOPE: finalAnalysis.scope,
      DATE: now.split("T")[0] || now.substring(0, 10),
      CREATED_AT: now,
      UPDATED_AT: now,
    };

    // Write CLAUDE.md based on user's choice for existing files
    const claudeMdPath = path.join(navigatorPath, "CLAUDE.md");

    if (claudeMdAction === "skip") {
      if (!options.quiet) {
        console.log("⏭️  Skipped CLAUDE.md (keeping existing)");
      }
    } else if (claudeMdAction === "integrate" && hasExistingClaudeMd) {
      // Read existing CLAUDE.md and append autonav section
      const existingContent = fs.readFileSync(existingClaudeMdPath, "utf-8");
      const autonav_section = `

---

## Autonav Integration

This repository has been configured as an Autonav knowledge base.

**Purpose**: ${finalAnalysis.purpose}

**Scope**: ${finalAnalysis.scope}

**Audience**: ${finalAnalysis.audience}

**Knowledge paths**:
${knowledgePathsList || "- (see repository structure)"}

### Autonav Grounding Rules

When answering questions about this repository:
- Always cite specific files and sections
- Use exact headings and references
- If you don't know something, say so explicitly
- Never make up information not in the knowledge base

See \`config.json\` for navigator configuration.
`;
      fs.writeFileSync(claudeMdPath, existingContent + autonav_section);
      if (!options.quiet) {
        console.log("✓ Integrated autonav section into existing CLAUDE.md");
      }
    } else {
      // Overwrite with full autonav template
      fs.writeFileSync(
        claudeMdPath,
        replaceTemplateVars(templates.claudeMd, vars)
      );
      if (!options.quiet) {
        console.log("✓ Created CLAUDE.md");
      }
    }

    // Write config.json with knowledgeBase path
    const configContent = JSON.stringify(
      {
        version: "0.1.0",
        name: navigatorName,
        description: finalAnalysis.purpose,
        created: now,
        knowledgeBase: options.inPlace ? "." : sourcePath,
        importedFrom: {
          path: sourcePath,
          analyzedAt: now,
          confidence: finalAnalysis.confidence,
        },
        plugins: {
          configFile: "./.claude/plugins.json",
        },
      },
      null,
      2
    );
    fs.writeFileSync(path.join(navigatorPath, "config.json"), configContent);
    if (!options.quiet) {
      console.log("✓ Created config.json");
    }

    // Write plugins.json
    const pluginsPath = path.join(navigatorPath, ".claude", "plugins.json");
    if (!fs.existsSync(pluginsPath)) {
      fs.writeFileSync(pluginsPath, templates.pluginsJson);
      if (!options.quiet) {
        console.log("✓ Configured plugins.json");
      }
    }

    // Write .gitignore if not in-place (don't override existing)
    if (!options.inPlace) {
      fs.writeFileSync(
        path.join(navigatorPath, ".gitignore"),
        templates.gitignore
      );

      // Write README.md
      fs.writeFileSync(
        path.join(navigatorPath, "README.md"),
        replaceTemplateVars(templates.readme, vars)
      );
    }

    // Create local skill and symlink to global for inter-navigator communication
    await createAndSymlinkSkill(
      navigatorPath,
      {
        navigatorName,
        navigatorPath,
        description: finalAnalysis.purpose,
        scope: finalAnalysis.scope,
        audience: finalAnalysis.audience,
      },
      { force: options.force, quiet: options.quiet }
    );

    if (!options.quiet) {
      console.log("✓ Navigator ready at " + (options.inPlace ? sourcePath : `./${navigatorName}`));

      console.log("\nNext steps:");
      if (options.inPlace) {
        console.log("  1. Review CLAUDE.md and customize as needed");
        console.log("  2. Use Claude Code: claude");
        console.log(`  3. Or query directly: autonav query . "your question"\n`);
      } else {
        console.log(`  1. cd ${navigatorName}`);
        console.log("  2. Review CLAUDE.md and customize as needed");
        console.log("  3. Use Claude Code: claude");
        console.log(`  4. Or query directly: autonav query ${navigatorName} "your question"\n`);
      }

      console.log("💡 Tips:");
      console.log(`  - Knowledge base path: ${options.inPlace ? "." : sourcePath}`);
      console.log("  - Edit CLAUDE.md to customize the navigator's behavior");
      console.log("  - Enable plugins in .claude/plugins.json\n");
    } else {
      console.log(`✓ Created navigator: ${navigatorName}`);
    }
  } catch (error) {
    console.error(
      `\n❌ Error importing repository: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
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

  // Validate mutual exclusivity of --from and --pack
  if (options.from && (options.pack || options.packFile)) {
    console.error("❌ Error: Cannot use --from with --pack or --pack-file\n");
    process.exit(1);
  }

  // Handle --from without name (in-place mode)
  if (options.from && !navigatorName) {
    const sourcePath = path.resolve(options.from);
    const inferredName = path.basename(sourcePath);

    if (!options.quiet) {
      console.log(`\n⚠️  No navigator name specified with --from flag.`);
      console.log(
        `   Assuming --in-place mode: files will be added to source repository.`
      );
      console.log(`   Navigator name: ${inferredName}\n`);
    }

    await handleImportMode(inferredName, options);
    return;
  }

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

  // Handle import mode (--from)
  if (options.from) {
    await handleImportMode(navigatorName, options);
    return;
  }

  const navigatorPath = path.resolve(process.cwd(), navigatorName);

  // Check if directory already exists
  if (fs.existsSync(navigatorPath)) {
    // Check if there's saved interview progress - if so, allow continuing
    if (hasProgress(navigatorPath)) {
      // Directory exists with progress - we'll handle resume logic later in the interview flow
      if (!options.quiet) {
        console.log(`📂 Found existing directory with saved interview progress`);
      }
    } else if (!options.force) {
      console.error(`❌ Error: Directory already exists: ${navigatorPath}`);
      console.error("Use --force to overwrite\n");
      process.exit(1);
    } else {
      // Remove existing directory if --force is specified (and no progress)
      if (!options.quiet) {
        console.log(`⚠️  Removing existing directory: ${navigatorPath}`);
      }
      fs.rmSync(navigatorPath, { recursive: true, force: true });
    }
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

    // Handle knowledge pack installation FIRST (needed for interview context)
    let packMetadata: { name: string; version: string } | null = null;
    let packContext: PackContext | undefined;

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

        // Read INIT.md from pack if it exists (for interview guidance)
        const initMdPath = path.join(navigatorPath, "INIT.md");
        let initGuide: string | undefined;
        if (fs.existsSync(initMdPath)) {
          initGuide = fs.readFileSync(initMdPath, "utf-8");
          if (!options.quiet) {
            console.log("✓ Found pack interview guide (INIT.md)");
          }
        }

        // Create pack context for interview
        packContext = {
          packName: packMetadata.name,
          packVersion: packMetadata.version,
          initGuide,
        };
      } catch (error) {
        console.error(
          `\n❌ Error installing pack: ${error instanceof Error ? error.message : String(error)}\n`
        );
        // Clean up on pack installation failure
        fs.rmSync(navigatorPath, { recursive: true, force: true });
        process.exit(1);
      }
    }

    // Run interactive interview unless --quick is specified
    let interviewConfig: NavigatorConfig | null = null;
    const wantsInterview = !options.quick;

    if (wantsInterview) {
      // Check if we're in an interactive terminal
      if (!isInteractiveTerminal()) {
        if (!options.quiet) {
          console.log("⚠️  Non-interactive terminal detected. Skipping interview (use --quick to silence this).");
          console.log("   Run in an interactive terminal to customize your navigator.\n");
        }
      } else {
        try {
          // Check for existing progress
          let savedProgress: InterviewProgress | undefined;
          if (hasProgress(navigatorPath)) {
            const progress = loadProgress(navigatorPath);
            if (progress && !options.force) {
              const shouldResume = await promptResumeProgress(progress);
              if (shouldResume) {
                savedProgress = progress;
                if (!options.quiet) {
                  console.log("✓ Resuming from saved progress\n");
                }
              } else {
                // User chose not to resume, clear the progress
                clearProgress(navigatorPath);
                if (!options.quiet) {
                  console.log("✓ Starting fresh interview\n");
                }
              }
            }
          }

          interviewConfig = await runInterviewTUI(navigatorName, {
            navigatorPath,
            packContext,
            savedProgress,
          });
          if (!options.quiet) {
            console.log("\n✓ Interview completed");
          }
        } catch (error) {
          // User cancelled or error occurred
          if (error instanceof Error && error.message === "Interview cancelled by user") {
            console.log("\n⚠️  Interview cancelled. Cleaning up...");
            // Clean up the directory but keep the progress file for resume
            const progressPath = path.join(navigatorPath, ".autonav-init-progress.json");
            const hasProgressFile = fs.existsSync(progressPath);

            if (hasProgressFile) {
              // Save the progress file temporarily
              const tempProgressPath = path.join(os.tmpdir(), `.autonav-init-progress-${navigatorName}.json`);
              fs.copyFileSync(progressPath, tempProgressPath);

              // Clean up the directory
              fs.rmSync(navigatorPath, { recursive: true, force: true });

              // Restore the progress file
              fs.mkdirSync(navigatorPath, { recursive: true });
              fs.copyFileSync(tempProgressPath, progressPath);
              fs.unlinkSync(tempProgressPath);

              if (!options.quiet) {
                console.log("💾 Progress saved. Run the same command again to resume.\n");
              }
            } else {
              fs.rmSync(navigatorPath, { recursive: true, force: true });
            }
            process.exit(0);
          }
          throw error;
        }
      }
    }

    // Prepare template variables
    const now = new Date().toISOString();
    const description = interviewConfig?.purpose || `Knowledge navigator for ${titleCase(navigatorName)}`;
    const scope = interviewConfig?.scope || "[Define what this navigator knows about and what it doesn't]";
    const vars: Record<string, string> = {
      NAVIGATOR_NAME: navigatorName,
      NAVIGATOR_DESCRIPTION: description,
      NAVIGATOR_CONTEXT: "", // Empty for non-import navigators
      KNOWLEDGE_BASE_PATH: "./knowledge",
      KNOWLEDGE_PATHS_SECTION: "\n",
      DOMAIN_SCOPE: scope,
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

    // Write CLAUDE.md
    // Priority: interview config > pack template > default template
    let claudeMdContent: string;
    if (interviewConfig?.claudeMd) {
      // Use personalized CLAUDE.md from interview
      claudeMdContent = interviewConfig.claudeMd;
    } else if (packMetadata) {
      // Use pack template
      claudeMdContent = replaceTemplateVars(templates.claudeMdPack, vars);
    } else {
      // Use default template
      claudeMdContent = replaceTemplateVars(templates.claudeMd, vars);
    }
    fs.writeFileSync(path.join(navigatorPath, "CLAUDE.md"), claudeMdContent);
    if (!options.quiet) {
      console.log(
        interviewConfig?.claudeMd
          ? "✓ Created personalized CLAUDE.md"
          : "✓ Created CLAUDE.md template"
      );
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

    // Create local skill and symlink to global for inter-navigator communication
    await createAndSymlinkSkill(
      navigatorPath,
      {
        navigatorName,
        navigatorPath,
        description,
        scope: interviewConfig?.scope,
        audience: interviewConfig?.audience,
      },
      { force: options.force, quiet: options.quiet }
    );

    if (!options.quiet) {
      console.log("✓ Navigator ready at ./" + navigatorName);

      console.log("\nNext steps:");
      console.log(`  1. cd ${navigatorName}`);
      if (!packMetadata) {
        console.log("  2. Add your documentation to knowledge/ directory");
        console.log("  3. Edit CLAUDE.md to customize behavior");
        console.log("  4a. Use Claude Code: claude");
        console.log(`  4b. Or query directly: autonav query ${navigatorName} "test question"\n`);
      } else {
        console.log("  2a. Use Claude Code: claude");
        console.log(`  2b. Or query directly: autonav query ${navigatorName} "test question"\n`);
      }

      console.log("💡 Tips:");
      console.log("  - Edit CLAUDE.md to customize the navigator's behavior");
      console.log("  - Check config.json for configuration options");
      console.log("  - Enable plugins in .claude/plugins.json (Slack, GitHub, file watcher)");
      console.log("  - See README.md for full usage instructions\n");
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
