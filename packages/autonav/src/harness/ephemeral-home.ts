/**
 * Ephemeral Home
 *
 * Creates temporary home directories for harness sessions. Each harness
 * (chibi, opencode, etc.) can use this to inject custom plugins/tools
 * into the agent's environment without polluting global config.
 *
 * Base location priority:
 *   1. AUTONAV_<HARNESS>_HOME env var (e.g. AUTONAV_CHIBI_HOME)
 *   2. os.tmpdir()
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

export interface EphemeralHomeOptions {
  /** Harness name used for dir prefix and env var lookup (e.g. "chibi", "opencode") */
  harness: string;
  /** Callback to populate the home directory after creation */
  setup: (homePath: string) => void;
}

export interface EphemeralHome {
  /** Absolute path to the ephemeral home directory */
  homePath: string;
  /** Remove the ephemeral home directory and all contents */
  cleanup: () => void;
}

/**
 * Create an ephemeral home directory for a harness session.
 *
 * The directory is created under:
 *   - $AUTONAV_<HARNESS>_HOME if set (e.g. AUTONAV_CHIBI_HOME=/tmp/my-chibi)
 *   - os.tmpdir() otherwise
 *
 * Directory name: `autonav-<harness>-<uuid>/`
 */
export function createEphemeralHome(opts: EphemeralHomeOptions): EphemeralHome {
  const envKey = `AUTONAV_${opts.harness.toUpperCase()}_HOME`;
  const base = process.env[envKey] || os.tmpdir();
  const dirName = `autonav-${opts.harness}-${crypto.randomUUID().slice(0, 8)}`;
  const homePath = path.join(base, dirName);

  fs.mkdirSync(homePath, { recursive: true });

  try {
    opts.setup(homePath);
  } catch (err) {
    // Clean up on setup failure
    try {
      fs.rmSync(homePath, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }

  return {
    homePath,
    cleanup: () => {
      try {
        fs.rmSync(homePath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}
