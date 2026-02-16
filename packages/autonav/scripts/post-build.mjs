#!/usr/bin/env node

/**
 * Post-build script for autonav package
 * Makes CLI scripts executable and copies template files
 * Cross-platform compatible (works on Windows, Linux, macOS)
 */

import { chmod, copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = dirname(__dirname);

async function postBuild() {
  try {
    console.log('Running post-build tasks...');

    // Make CLI scripts executable (Unix-like systems only)
    if (process.platform !== 'win32') {
      const cliDir = join(packageRoot, 'dist', 'cli');
      if (existsSync(cliDir)) {
        const files = await readdir(cliDir);
        const jsFiles = files.filter(f => f.endsWith('.js'));

        for (const file of jsFiles) {
          const filePath = join(cliDir, file);
          await chmod(filePath, 0o755);
          console.log(`✓ Made executable: dist/cli/${file}`);
        }
      }
    } else {
      console.log('⊘ Skipping chmod (Windows)');
    }

    // Create templates directory if it doesn't exist
    const templatesDir = join(packageRoot, 'dist', 'templates');
    if (!existsSync(templatesDir)) {
      await mkdir(templatesDir, { recursive: true });
      console.log(`✓ Created directory: dist/templates`);
    }

    // Copy template files (including hidden files like .gitignore.template)
    const srcTemplatesDir = join(packageRoot, 'src', 'templates');
    if (existsSync(srcTemplatesDir)) {
      const files = await readdir(srcTemplatesDir, { withFileTypes: true });
      const templateFiles = files.filter(f => f.isFile() && f.name.endsWith('.template'));

      for (const file of templateFiles) {
        const srcPath = join(srcTemplatesDir, file.name);
        const destPath = join(templatesDir, file.name);
        await copyFile(srcPath, destPath);
        console.log(`✓ Copied: src/templates/${file.name} -> dist/templates/${file.name}`);
      }

      // Also copy .gitignore.template (starts with dot, so not caught by filter above)
      const gitignoreTemplate = '.gitignore.template';
      const gitignoreSrc = join(srcTemplatesDir, gitignoreTemplate);
      if (existsSync(gitignoreSrc)) {
        const gitignoreDest = join(templatesDir, gitignoreTemplate);
        await copyFile(gitignoreSrc, gitignoreDest);
        console.log(`✓ Copied: src/templates/${gitignoreTemplate} -> dist/templates/${gitignoreTemplate}`);
      }
    }

    // Copy chibi-plugins (non-TS files that tsc doesn't copy)
    const srcPluginsDir = join(packageRoot, 'src', 'harness', 'chibi-plugins');
    if (existsSync(srcPluginsDir)) {
      const destPluginsDir = join(packageRoot, 'dist', 'harness', 'chibi-plugins');
      if (!existsSync(destPluginsDir)) {
        await mkdir(destPluginsDir, { recursive: true });
      }
      const pluginFiles = await readdir(srcPluginsDir);
      for (const file of pluginFiles) {
        const srcPath = join(srcPluginsDir, file);
        const destPath = join(destPluginsDir, file);
        await copyFile(srcPath, destPath);
        if (process.platform !== 'win32') {
          await chmod(destPath, 0o755);
        }
        console.log(`✓ Copied chibi plugin: ${file}`);
      }
    }

    console.log('✅ Post-build completed successfully');
  } catch (error) {
    console.error('❌ Post-build failed:', error);
    process.exit(1);
  }
}

postBuild();
