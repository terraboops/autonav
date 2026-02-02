/**
 * Migration v1.3.1: Remove submit_answer Tool Instructions from CLAUDE.md
 *
 * This migration removes submit_answer tool instructions from CLAUDE.md templates.
 * The submit_answer tool is an MCP tool that only exists when running via `autonav query`,
 * not when running Claude Code TUI directly. Having these instructions in CLAUDE.md
 * causes Claude to hallucinate the tool when running in TUI mode.
 *
 * The correct design:
 * - CLAUDE.md: General grounding rules + response format guidelines (no tool mention)
 * - autonav query prompt: Injects submit_answer requirement (tool only exists here)
 *
 * Changes:
 * - Replaces "Response Format" section to remove submit_answer tool instructions
 * - Updates section to focus on grounding and citation principles
 * - Removes tool-specific examples
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";

const MIGRATION_VERSION = "1.3.1";

/**
 * The new Response Format section without submit_answer tool mention
 */
const NEW_RESPONSE_FORMAT_SECTION = `## Response Format

When answering questions, provide clear answers with proper citations:

1. **Search first**: Use available tools to find relevant information
2. **Cite sources**: Always reference specific files and sections where you found the information
3. **Be grounded**: Only claim what's documented in the knowledge base
4. **Acknowledge uncertainty**: If information is unclear or missing, say so explicitly

### Source Citation Format

Include inline citations in your answers:
- Reference specific files: \`[deployment/ssl-config.md: SSL Configuration]\`
- Quote relevant excerpts when helpful
- Link conclusions to specific documentation

### Confidence Assessment

When uncertain about an answer:
- **High confidence**: Information is explicit and well-documented
- **Medium confidence**: Information requires some interpretation or combining sources
- **Low confidence**: Information is sparse, unclear, or partially missing

If your confidence is low, acknowledge the uncertainty and suggest that verification may be needed.`;

/**
 * Detect if CLAUDE.md has old submit_answer tool instructions
 */
function hasSubmitAnswerInstructions(claudeMdContent: string): boolean {
  // Check if CLAUDE.md mentions submit_answer tool
  return claudeMdContent.includes('submit_answer');
}

/**
 * Extract the section between two headers in markdown
 */
function extractSection(content: string, startHeader: string, endHeader?: string): { content: string; startPos: number; endPos: number } | null {
  const lines = content.split('\n');
  let startIndex = -1;
  let endIndex = lines.length;

  // Find start
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.trim() === startHeader) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  // Find end (next header of same or higher level, or specified header)
  if (endHeader) {
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.trim() === endHeader) {
        endIndex = i;
        break;
      }
    }
  } else {
    // Find next header of same or higher level
    const startHeaderLevel = startHeader.match(/^#+/)?.[0].length || 2;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const headerMatch = line.match(/^(#+)\s/);
      if (headerMatch && headerMatch[1] && headerMatch[1].length <= startHeaderLevel) {
        endIndex = i;
        break;
      }
    }
  }

  const sectionContent = lines.slice(startIndex, endIndex).join('\n');
  const startPos = lines.slice(0, startIndex).join('\n').length + (startIndex > 0 ? 1 : 0);
  const endPos = lines.slice(0, endIndex).join('\n').length + (endIndex > 0 ? 1 : 0);

  return { content: sectionContent, startPos, endPos };
}

/**
 * Check if this migration is needed
 */
async function check(navPath: string): Promise<MigrationCheck> {
  const claudeMdPath = path.join(navPath, "CLAUDE.md");

  if (!fs.existsSync(claudeMdPath)) {
    return {
      needed: false,
      reason: "No CLAUDE.md file found",
    };
  }

  const content = fs.readFileSync(claudeMdPath, "utf-8");

  if (!hasSubmitAnswerInstructions(content)) {
    return {
      needed: false,
      reason: "CLAUDE.md already updated (no submit_answer tool instructions)",
    };
  }

  return {
    needed: true,
    reason: "CLAUDE.md contains submit_answer tool instructions that should be removed",
  };
}

/**
 * Apply the migration
 */
async function apply(navPath: string, confirm: ConfirmFn): Promise<MigrationResult> {
  const claudeMdPath = path.join(navPath, "CLAUDE.md");
  const filesModified: string[] = [];

  try {
    let content = fs.readFileSync(claudeMdPath, "utf-8");

    // Count how many submit_answer references exist
    const submitAnswerMatches = content.match(/submit_answer/g);
    const refCount = submitAnswerMatches ? submitAnswerMatches.length : 0;

    // Ask for confirmation
    const confirmed = await confirm(
      "Remove all submit_answer references from CLAUDE.md",
      `This will remove all submit_answer tool instructions from CLAUDE.md (${refCount} reference${refCount === 1 ? '' : 's'} found).\n\nThe submit_answer tool only exists when running via 'autonav query' and should not be mentioned in CLAUDE.md (which is read by all Claude Code sessions).\n\nChanges:\n1. Replace Response Format section with general grounding guidelines\n2. Remove any remaining submit_answer mentions throughout the file`
    );

    if (!confirmed) {
      return {
        success: false,
        message: "Migration cancelled by user",
        filesModified,
      };
    }

    // Step 1: Replace the Response Format section (main change)
    let section = extractSection(content, "## Response Format", "## Remember");
    if (!section) {
      section = extractSection(content, "## Response Format");
    }

    if (section) {
      content =
        content.substring(0, section.startPos) +
        NEW_RESPONSE_FORMAT_SECTION +
        content.substring(section.endPos);
    }

    // Step 2: Remove any remaining submit_answer references (global cleanup)
    // Common patterns to remove:
    content = content.replace(/\*\*CRITICAL:\s*Always use the submit_answer tool[^*]*\*\*/gi, '');
    content = content.replace(/submit_answer\([^)]*\)/g, '');
    content = content.replace(/- Use `submit_answer`[^\n]*/gi, '');
    content = content.replace(/Use the `submit_answer`[^\n]*/gi, '');
    content = content.replace(/\s*submit_answer\s*/g, ' ');

    // Clean up any double blank lines created by removals
    content = content.replace(/\n\n\n+/g, '\n\n');

    // Write the updated content
    fs.writeFileSync(claudeMdPath, content, "utf-8");
    filesModified.push("CLAUDE.md");

    // Update config.json version if it exists
    const configPath = path.join(navPath, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config.version = MIGRATION_VERSION;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      filesModified.push("config.json");
    }

    return {
      success: true,
      message: `Successfully updated to v${MIGRATION_VERSION} - Removed all ${refCount} submit_answer reference${refCount === 1 ? '' : 's'}`,
      filesModified,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Migration failed: ${errorMsg}`,
      filesModified,
      errors: [errorMsg],
    };
  }
}

export const migration: Migration = {
  version: MIGRATION_VERSION,
  description: "Remove submit_answer tool instructions from CLAUDE.md",
  check,
  apply,
};
