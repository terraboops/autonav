/**
 * Harness Factory
 *
 * Resolves and creates the appropriate harness based on configuration.
 *
 * Resolution priority:
 * 1. Explicit type parameter
 * 2. CLI flag: --harness chibi
 * 3. Env var: AUTONAV_HARNESS=chibi
 * 4. Navigator config.json: harness.type
 * 5. Default: claude-code
 */

import type { Harness, HarnessType } from "./types.js";
import { ClaudeCodeHarness } from "./claude-code-harness.js";

/**
 * Resolve harness type from available sources.
 *
 * @param explicit - Explicit type (from CLI flag or direct call)
 * @param navigatorConfig - Navigator config object (may have harness.type)
 * @returns Resolved harness type
 */
export function resolveHarnessType(
  explicit?: string,
  navigatorConfig?: { harness?: { type?: string } }
): HarnessType {
  // 1. Explicit parameter (from CLI --harness flag)
  if (explicit) {
    return validateHarnessType(explicit);
  }

  // 2. Environment variable
  const envType = process.env.AUTONAV_HARNESS;
  if (envType) {
    return validateHarnessType(envType);
  }

  // 3. Navigator config
  if (navigatorConfig?.harness?.type) {
    return validateHarnessType(navigatorConfig.harness.type);
  }

  // 4. Default
  return "claude-code";
}

/**
 * Validate a string is a valid HarnessType
 */
function validateHarnessType(value: string): HarnessType {
  const valid: HarnessType[] = ["claude-code", "chibi"];
  if (!valid.includes(value as HarnessType)) {
    throw new Error(
      `Invalid harness type: "${value}". Valid types: ${valid.join(", ")}`
    );
  }
  return value as HarnessType;
}

/**
 * Create a harness instance for the given type.
 *
 * @param type - Harness type to create
 * @returns Harness instance
 */
export async function createHarness(type: HarnessType): Promise<Harness> {
  switch (type) {
    case "claude-code":
      return new ClaudeCodeHarness();

    case "chibi": {
      // Dynamic import to avoid loading chibi dependencies when not needed
      const { ChibiHarness } = await import("./chibi-harness.js");
      return new ChibiHarness();
    }

    default:
      throw new Error(`Unknown harness type: ${type}`);
  }
}

/**
 * Resolve harness type and create instance in one call.
 *
 * This is the main entry point for harness creation.
 *
 * @param explicit - Explicit type (from CLI --harness flag)
 * @param navigatorConfig - Navigator config object
 * @returns Ready-to-use Harness instance
 */
export async function resolveAndCreateHarness(
  explicit?: string,
  navigatorConfig?: { harness?: { type?: string } }
): Promise<Harness> {
  const type = resolveHarnessType(explicit, navigatorConfig);
  return createHarness(type);
}
