/**
 * Migration v1.3.1: Add submit_answer Tool Instructions
 *
 * This migration updates CLAUDE.md to use the submit_answer tool instead of
 * raw JSON output. The query command expects navigators to call submit_answer
 * to terminate the agent loop, but older templates instructed raw JSON output.
 *
 * Changes:
 * - Replaces "Response Format" section with submit_answer tool instructions
 * - Updates examples to show tool calls instead of JSON blocks
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Migration, MigrationCheck, MigrationResult, ConfirmFn } from "../types.js";

const MIGRATION_VERSION = "1.3.1";

/**
 * The new Response Format section that uses submit_answer tool
 */
const NEW_RESPONSE_FORMAT_SECTION = `## Response Format

You MUST use the \`submit_answer\` tool to submit your answers. Do NOT respond with plain text or JSON in your message.

The submit_answer tool requires:
- \`answer\`: Your complete answer with inline citations
- \`sources\`: Array of sources with file, section, and relevance
- \`confidence\`: Score from 0 to 1 (0.8+ for well-grounded, 0.5-0.8 for partial, <0.5 if uncertain)

Example tool call:
\`\`\`typescript
submit_answer({
  answer: "To configure SSL, update the load balancer settings as described in deployment/ssl-config.md. Set the certificate_arn parameter in the aws_lb_listener resource.",
  sources: [
    {
      file: "deployment/ssl-config.md",
      section: "SSL Configuration",
      relevance: "Explains certificate setup and Terraform configuration"
    }
  ],
  confidence: 0.95
})
\`\`\`

## Good Response Example

**Question**: "How do I configure SSL?"

**Process**:
1. Search knowledge base for SSL configuration
2. Read relevant files
3. Call submit_answer tool with findings

**Tool Call**:
\`\`\`typescript
submit_answer({
  answer: "To configure SSL, you need to update the load balancer settings. According to deployment/ssl-config.md, you should set the certificate ARN in the Terraform configuration.",
  sources: [
    {
      file: "deployment/ssl-config.md",
      section: "SSL Configuration",
      relevance: "Provides step-by-step SSL certificate setup instructions"
    }
  ],
  confidence: 0.95
})
\`\`\`

## Bad Response Example (Don't do this)

**Question**: "How do I configure SSL?"

**Wrong approach**:
- Responding with plain text instead of using submit_answer tool
- Not citing specific sources
- Inventing file paths that don't exist

**Problems**:
- No submit_answer tool call
- Vague answer without specifics
- Claims knowledge without evidence`;

/**
 * Detect if CLAUDE.md has the old JSON response format
 */
function hasOldResponseFormat(claudeMdContent: string): boolean {
  // Look for the old JSON schema format markers
  const hasOldJsonSchema = claudeMdContent.includes('"protocolVersion":') ||
    claudeMdContent.includes('Always structure your responses as JSON');

  const hasSubmitAnswerTool = claudeMdContent.includes('submit_answer');

  // If it has the old JSON format but not the submit_answer tool, it needs migration
  return hasOldJsonSchema && !hasSubmitAnswerTool;
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

  if (!hasOldResponseFormat(content)) {
    return {
      needed: false,
      reason: "CLAUDE.md already uses submit_answer tool or doesn't have old format",
    };
  }

  return {
    needed: true,
    reason: "CLAUDE.md uses old JSON response format instead of submit_answer tool",
  };
}

/**
 * Apply the migration
 */
async function apply(navPath: string, confirm: ConfirmFn): Promise<MigrationResult> {
  const claudeMdPath = path.join(navPath, "CLAUDE.md");
  const filesModified: string[] = [];

  try {
    const content = fs.readFileSync(claudeMdPath, "utf-8");

    // Find the old Response Format section
    const section = extractSection(content, "## Response Format");

    if (!section) {
      return {
        success: false,
        message: "Could not find '## Response Format' section in CLAUDE.md",
        filesModified,
        errors: ["Missing '## Response Format' section"],
      };
    }

    // Ask for confirmation
    const confirmed = await confirm(
      "Replace Response Format section in CLAUDE.md",
      `This will replace the old JSON output format with submit_answer tool instructions.\n\nOld section (${section.content.split('\n').length} lines) will be replaced with the new tool-based format.`
    );

    if (!confirmed) {
      return {
        success: false,
        message: "Migration cancelled by user",
        filesModified,
      };
    }

    // Replace the section (TypeScript knows section is not null here)
    const newContent =
      content.substring(0, section.startPos) +
      NEW_RESPONSE_FORMAT_SECTION +
      content.substring(section.endPos);

    // Write the updated content
    fs.writeFileSync(claudeMdPath, newContent, "utf-8");
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
      message: `Successfully updated to v${MIGRATION_VERSION}`,
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
  description: "Add submit_answer tool instructions to CLAUDE.md",
  check,
  apply,
};
