/**
 * Test utilities for autonav smoke tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as tar from 'tar';

/**
 * Create a temporary test navigator directory
 */
export function createTempNav(name: string, tempDir: string): string {
  const navPath = path.join(tempDir, name);
  fs.mkdirSync(navPath, { recursive: true });
  return navPath;
}

/**
 * Create a mock knowledge pack tarball for testing
 */
export async function createMockPack(
  tempDir: string,
  options: {
    name: string;
    version: string;
    files: Record<string, string>;
  }
): Promise<string> {
  const packDir = path.join(tempDir, 'pack-temp');
  fs.mkdirSync(packDir, { recursive: true });

  // Create metadata.json (required for pack validation)
  fs.writeFileSync(
    path.join(packDir, 'metadata.json'),
    JSON.stringify({
      name: options.name,
      version: options.version,
      description: `Test pack ${options.name}`,
    })
  );

  // Create pack files
  for (const [filePath, content] of Object.entries(options.files)) {
    const fullPath = path.join(packDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  // Create tarball
  const tarPath = path.join(tempDir, `${options.name}-${options.version}.tar.gz`);
  await tar.create(
    {
      gzip: true,
      file: tarPath,
      cwd: packDir,
    },
    ['.']
  );

  // Clean up temp pack directory
  fs.rmSync(packDir, { recursive: true, force: true });

  return tarPath;
}

/**
 * Verify navigator directory structure
 */
export function verifyNavigatorStructure(navPath: string): {
  valid: boolean;
  missing: string[];
} {
  const required = [
    'config.json',
    'CLAUDE.md',
    '.claude/plugins.json',
    '.gitignore',
    'README.md',
    'knowledge',
  ];

  const missing = required.filter(
    (file) => !fs.existsSync(path.join(navPath, file))
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Execute init command by spawning the built CLI (for testing)
 *
 * This runs the init command as a child process, which is more realistic
 * and doesn't require modifying the source files.
 */
export async function executeInit(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<void> {
  const { spawn } = await import('node:child_process');
  const { promisify } = await import('node:util');

  // Find the autonav CLI (use the built version)
  const cliPath = path.join(process.cwd(), 'dist/cli/autonav.js');

  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Create a mock source repository for testing --from flag
 */
export function createMockSourceRepo(tempDir: string): string {
  const sourceRepo = path.join(tempDir, 'source-repo');
  fs.mkdirSync(sourceRepo, { recursive: true });

  // Create some mock files
  fs.writeFileSync(path.join(sourceRepo, 'README.md'), '# Source Repository\n\nThis is a test repository.');
  fs.writeFileSync(path.join(sourceRepo, 'package.json'), JSON.stringify({
    name: 'test-repo',
    version: '1.0.0',
    description: 'Test repository for import testing'
  }, null, 2));

  // Create some mock source files
  fs.mkdirSync(path.join(sourceRepo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepo, 'src', 'index.ts'),
    'export function hello() {\n  console.log("Hello, world!");\n}\n'
  );

  return sourceRepo;
}

/**
 * Clean up test directory
 */
/**
 * Clean up test skill symlinks by name pattern
 */
export function cleanupTestSkills(patterns: string[]): void {
  const skillsDir = path.join(os.homedir(), '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) {
    return;
  }

  try {
    const skills = fs.readdirSync(skillsDir);
    for (const skill of skills) {
      // Check if skill matches any of the test patterns
      const matches = patterns.some(pattern =>
        skill.includes(pattern) || skill.startsWith('ask-') || skill.startsWith('update-')
      );

      if (matches) {
        const skillPath = path.join(skillsDir, skill);
        try {
          const stats = fs.lstatSync(skillPath);
          if (stats.isSymbolicLink()) {
            const target = fs.readlinkSync(skillPath);
            // Only remove if target is in temp directory or doesn't exist
            if (target.includes('/tmp/') || target.includes('\\temp\\') || !fs.existsSync(target)) {
              fs.unlinkSync(skillPath);
            }
          }
        } catch {
          // Ignore errors reading individual skills
        }
      }
    }
  } catch {
    // Ignore errors if skills directory doesn't exist or can't be read
  }
}

export function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    // Clean up any global skill symlinks before removing the directory
    const skillsDir = path.join(os.homedir(), '.claude', 'skills');
    if (fs.existsSync(skillsDir)) {
      try {
        const skills = fs.readdirSync(skillsDir);
        for (const skill of skills) {
          const skillPath = path.join(skillsDir, skill);
          try {
            const stats = fs.lstatSync(skillPath);
            if (stats.isSymbolicLink()) {
              const target = fs.readlinkSync(skillPath);
              // If the symlink points to a path inside our test directory, remove it
              if (target.startsWith(dir)) {
                fs.unlinkSync(skillPath);
              }
            }
          } catch {
            // Ignore errors reading individual skills
          }
        }
      } catch {
        // Ignore errors if skills directory doesn't exist or can't be read
      }
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }
}
