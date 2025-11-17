import * as fs from "node:fs";
import * as path from "node:path";
import {
  NavigatorConfig,
  NavigatorConfigSchema,
} from "@platform-ai/communication-layer";

/**
 * Loaded navigator with all necessary context
 */
export interface LoadedNavigator {
  config: NavigatorConfig;
  systemPrompt: string;
  navigatorPath: string;
  knowledgeBasePath: string;
}

/**
 * Navigator resolution options
 */
export interface NavigatorResolveOptions {
  /**
   * Current working directory to resolve relative paths
   */
  cwd?: string;
}

/**
 * Load a navigator from a directory
 *
 * Reads and validates config.json and CLAUDE.md
 *
 * @param navigatorPathInput - Path to navigator (relative or absolute)
 * @param options - Resolution options
 * @returns Loaded navigator with configuration and context
 */
export function loadNavigator(
  navigatorPathInput: string,
  options?: NavigatorResolveOptions
): LoadedNavigator {
  const cwd = options?.cwd || process.cwd();
  const navigatorPath = resolveNavigatorPath(navigatorPathInput, cwd);

  // Validate directory exists
  if (!fs.existsSync(navigatorPath)) {
    throw new NavigatorLoadError(
      `Navigator directory not found: ${navigatorPath}`,
      {
        searchedPath: navigatorPath,
        suggestions: findSimilarNavigators(cwd),
      }
    );
  }

  // Check if it's a directory
  const stats = fs.statSync(navigatorPath);
  if (!stats.isDirectory()) {
    throw new NavigatorLoadError(
      `Navigator path is not a directory: ${navigatorPath}`
    );
  }

  // Load and validate config.json
  const config = loadNavigatorConfig(navigatorPath);

  // Load CLAUDE.md instructions
  const systemPrompt = loadSystemPrompt(navigatorPath, config);

  // Validate knowledge base exists
  const knowledgeBasePath = resolveKnowledgeBasePath(navigatorPath, config);
  validateKnowledgeBase(knowledgeBasePath);

  return {
    config,
    systemPrompt,
    navigatorPath,
    knowledgeBasePath,
  };
}

/**
 * Resolve navigator path from user input
 *
 * Handles:
 * - Relative paths: ./my-nav
 * - Absolute paths: /path/to/navigator
 * - By name: my-nav (searches in current directory)
 */
function resolveNavigatorPath(input: string, cwd: string): string {
  // If it's already absolute, use it
  if (path.isAbsolute(input)) {
    return input;
  }

  // Resolve relative to cwd
  return path.resolve(cwd, input);
}

/**
 * Load and validate navigator config.json
 */
function loadNavigatorConfig(navigatorPath: string): NavigatorConfig {
  const configPath = path.join(navigatorPath, "config.json");

  if (!fs.existsSync(configPath)) {
    throw new NavigatorLoadError(
      `config.json not found in ${navigatorPath}`,
      {
        missingFile: "config.json",
        suggestion:
          "Make sure you're pointing to a valid navigator directory. Use 'autonav init' to create a new navigator.",
      }
    );
  }

  try {
    const configContent = fs.readFileSync(configPath, "utf-8");
    const configJson = JSON.parse(configContent);
    return NavigatorConfigSchema.parse(configJson);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new NavigatorLoadError(
        `Invalid JSON in config.json: ${error.message}`,
        {
          file: configPath,
          error: error.message,
        }
      );
    }

    throw new NavigatorLoadError(
      `Invalid config.json: ${error instanceof Error ? error.message : String(error)}`,
      {
        file: configPath,
        validationError: error,
      }
    );
  }
}

/**
 * Load system prompt from CLAUDE.md
 */
function loadSystemPrompt(
  navigatorPath: string,
  _config: NavigatorConfig
): string {
  // Standard location for CLAUDE.md instructions
  const instructionsPath = path.join(navigatorPath, "CLAUDE.md");

  if (!fs.existsSync(instructionsPath)) {
    throw new NavigatorLoadError(
      `Instructions file not found: CLAUDE.md`,
      {
        missingFile: "CLAUDE.md",
        suggestion:
          "Navigator requires a CLAUDE.md file with instructions for Claude.",
      }
    );
  }

  try {
    return fs.readFileSync(instructionsPath, "utf-8");
  } catch (error) {
    throw new NavigatorLoadError(
      `Failed to read instructions file: ${error instanceof Error ? error.message : String(error)}`,
      {
        file: instructionsPath,
      }
    );
  }
}

/**
 * Resolve knowledge base path
 */
function resolveKnowledgeBasePath(
  navigatorPath: string,
  config: NavigatorConfig
): string {
  return path.join(navigatorPath, config.knowledgeBase);
}

/**
 * Validate knowledge base directory exists
 */
function validateKnowledgeBase(knowledgeBasePath: string): void {
  if (!fs.existsSync(knowledgeBasePath)) {
    throw new NavigatorLoadError(
      `Knowledge base directory not found: ${knowledgeBasePath}`,
      {
        missingDirectory: knowledgeBasePath,
        suggestion:
          "Navigator requires a knowledge-base directory with documentation files.",
      }
    );
  }

  const stats = fs.statSync(knowledgeBasePath);
  if (!stats.isDirectory()) {
    throw new NavigatorLoadError(
      `Knowledge base path is not a directory: ${knowledgeBasePath}`
    );
  }

  // Check if knowledge base has any files
  const files = fs.readdirSync(knowledgeBasePath);
  if (files.length === 0) {
    console.warn(
      `⚠ Warning: Knowledge base is empty: ${knowledgeBasePath}`
    );
  }
}

/**
 * Find similar navigators in the current directory
 * (for error messages with suggestions)
 */
function findSimilarNavigators(cwd: string): string[] {
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    const navigators: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(cwd, entry.name, "config.json");
        if (fs.existsSync(configPath)) {
          navigators.push(entry.name);
        }
      }
    }

    return navigators;
  } catch {
    return [];
  }
}

/**
 * Navigator load error with additional context
 */
export class NavigatorLoadError extends Error {
  constructor(
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "NavigatorLoadError";
  }
}
