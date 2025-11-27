/**
 * Validation utilities for navigator names and structure
 */

/**
 * Validate navigator name
 * Names must be valid directory names without special characters (except hyphens and underscores)
 */
export function validateNavigatorName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Navigator name cannot be empty" };
  }

  if (name.startsWith("-") || name.startsWith(".")) {
    return {
      valid: false,
      error: "Navigator name cannot start with '-' or '.'",
    };
  }

  // Check for invalid characters (allow alphanumeric, hyphens, underscores)
  const invalidChars = /[^a-zA-Z0-9\-_]/;
  if (invalidChars.test(name)) {
    return {
      valid: false,
      error:
        "Navigator name can only contain letters, numbers, hyphens, and underscores",
    };
  }

  // Reserved names
  const reserved = [
    "node_modules",
    ".git",
    ".env",
    "dist",
    "build",
    "test",
    "tests",
  ];
  if (reserved.includes(name.toLowerCase())) {
    return { valid: false, error: `'${name}' is a reserved name` };
  }

  return { valid: true };
}

/**
 * Validate created navigator structure
 */
export function validateNavigatorStructure(navigatorDir: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const fs = require("node:fs");
  const path = require("node:path");

  // Check required files exist
  const requiredFiles = ["config.json", "CLAUDE.md", ".gitignore"];

  for (const file of requiredFiles) {
    const filePath = path.join(navigatorDir, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  // Check required directories exist
  const requiredDirs = ["knowledge", ".claude"];

  for (const dir of requiredDirs) {
    const dirPath = path.join(navigatorDir, dir);
    if (!fs.existsSync(dirPath)) {
      errors.push(`Missing required directory: ${dir}`);
    }
  }

  // Check config.json is valid JSON
  try {
    const configPath = path.join(navigatorDir, "config.json");
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf-8");
      JSON.parse(configContent);
    }
  } catch (error) {
    errors.push(
      `Invalid config.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check plugins.json is valid JSON if it exists
  try {
    const pluginsPath = path.join(navigatorDir, ".claude", "plugins.json");
    if (fs.existsSync(pluginsPath)) {
      const pluginsContent = fs.readFileSync(pluginsPath, "utf-8");
      JSON.parse(pluginsContent);
    }
  } catch (error) {
    errors.push(
      `Invalid plugins.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
