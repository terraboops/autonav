import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

/**
 * Skill Generator
 *
 * Generates global Claude Code skills for navigators, enabling
 * inter-navigator communication via the "ask <navname>" pattern.
 */

export interface SkillConfig {
  /** Navigator name (used for skill name: ask-<navname>) */
  navigatorName: string;
  /** Absolute path to the navigator directory */
  navigatorPath: string;
  /** Navigator description/purpose */
  description: string;
  /** Topics the navigator covers */
  scope?: string;
  /** Who uses this navigator */
  audience?: string;
}

/**
 * Get the global skills directory path
 */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

/**
 * Check if a skill already exists
 */
export function skillExists(skillName: string): boolean {
  const skillDir = path.join(getGlobalSkillsDir(), skillName);
  return fs.existsSync(skillDir);
}

/**
 * Generate the skill name from navigator name
 */
export function getSkillName(navigatorName: string): string {
  // Convert to lowercase, replace spaces/underscores with hyphens
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `ask-${normalized}`;
}

/**
 * Generate the update skill name from navigator name
 */
export function getUpdateSkillName(navigatorName: string): string {
  // Convert to lowercase, replace spaces/underscores with hyphens
  const normalized = navigatorName.toLowerCase().replace(/[_\s]+/g, "-");
  return `update-${normalized}`;
}

/**
 * Generate the SKILL.md content for a navigator
 */
export function generateSkillContent(config: SkillConfig): string {
  const skillName = getSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Consult with ${config.navigatorName} navigator for questions about ${config.description}. Use when user asks to "ask ${config.navigatorName}" or needs information from this knowledge base.
---

# Ask ${config.navigatorName} Skill

## Purpose
Facilitate conversations with the **${config.navigatorName}** navigator located at \`${navPath}\`.

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ""}
${config.audience ? `**Audience**: ${config.audience}\n` : ""}

## When to Use This Skill

Use this skill when the user:
- Asks to "ask ${config.navigatorName.toLowerCase()}" or "query ${config.navigatorName.toLowerCase()}"
- Needs information from the ${config.navigatorName} knowledge base
- Wants to consult this navigator's domain expertise

## Communication Protocol

This navigator uses the Autonav communication layer for structured interactions.

### Query Format (NavigatorQuery)
\`\`\`json
{
  "protocolVersion": "1.0.0",
  "fromNavigator": "<your-navigator-name>",
  "toNavigator": "${config.navigatorName}",
  "question": "<the question>",
  "context": "<optional context>",
  "reason": "needs_specialist"
}
\`\`\`

### Response Format (NavigatorResponse)
\`\`\`json
{
  "protocolVersion": "1.0.0",
  "query": "<original question>",
  "answer": "<grounded answer with citations>",
  "sources": [
    {
      "filePath": "path/to/file.md",
      "excerpt": "exact quote",
      "section": "section heading"
    }
  ],
  "confidence": 0.85
}
\`\`\`

## Technical Implementation

### Starting a New Conversation

1. Generate a session UUID:
\`\`\`bash
UUID=$(python -c "import uuid; print(uuid.uuid4())")
\`\`\`

2. Start conversation:
\`\`\`bash
cd "${navPath}" && claude -p --session-id "$UUID" "$message"
\`\`\`

### Continuing a Conversation

\`\`\`bash
cd "${navPath}" && claude --resume "$UUID" -p "$message"
\`\`\`

### Using autonav query (Simpler)

For one-off queries without maintaining session state:
\`\`\`bash
autonav query "${navPath}" "your question here"
\`\`\`

## Conversation Template

When starting a conversation, provide:
1. **Context** - What you're working on
2. **Question** - Specific question for this navigator
3. **Expected format** - If you need structured output

Example:
\`\`\`
Hi ${config.navigatorName}! I'm working on [context].

Question: [your specific question]

Please provide sources for your answer.
\`\`\`

## Example Workflow

### Quick Query
\`\`\`bash
autonav query "${navPath}" "How do I configure X?"
\`\`\`

### Interactive Session
\`\`\`bash
# Generate UUID
UUID=$(python -c "import uuid; print(uuid.uuid4())")

# Start conversation
cd "${navPath}" && claude -p --session-id "$UUID" \\
  "I need help understanding the architecture. Can you explain the main components?"

# Follow up
cd "${navPath}" && claude --resume "$UUID" -p \\
  "Thanks! How do those components interact?"
\`\`\`

### With Write Access (for self-configuration)
\`\`\`bash
cd "${navPath}" && claude --resume "$UUID" -p --permission-mode acceptEdits \\
  "Please update the configuration to enable feature X"
\`\`\`

## Best Practices

1. **Provide Context** - Give enough information for grounded answers
2. **Be Specific** - Focused questions get better answers
3. **Request Sources** - Ask for citations to verify grounding
4. **Check Confidence** - Low confidence answers may need human review
5. **Use Structured Queries** - For programmatic access, use the NavigatorQuery format

## Grounding Rules

This navigator follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist

## Tool Usage

- Use \`Bash\` tool to communicate with the navigator
- Always \`cd\` to the navigator directory first
- Use \`-p\` flag for prompt mode
- Store UUIDs for multi-turn conversations
- Add \`--permission-mode acceptEdits\` only when edits are needed and confirmed

## Important Notes

- Navigator location: \`${navPath}\`
- Each conversation needs a unique UUID for session tracking
- Use \`autonav query\` for simple one-off questions
- Use \`claude -p --session-id\` for multi-turn conversations
`;
}

/**
 * Generate the update skill content for a navigator (with write permissions)
 */
export function generateUpdateSkillContent(config: SkillConfig): string {
  const skillName = getUpdateSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Update ${config.navigatorName} navigator by editing its documents and knowledge base. Use when user asks to "update ${config.navigatorName}" or when reporting implementation progress, issues, or changes.
---

# Update ${config.navigatorName} Skill

## Purpose
Enable write access to the **${config.navigatorName}** navigator at \`${navPath}\` for updating documentation, reporting progress, and managing knowledge base content.

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ""}
${config.audience ? `**Audience**: ${config.audience}\n` : ""}

## When to Use This Skill

Use this skill when you need to:
- Report implementation progress or issues to ${config.navigatorName}
- Update documentation in the knowledge base
- Add new knowledge files or sections
- Modify existing content
- Create implementation logs or status reports
- Track work progress across sessions

## Write Permission Mode

This skill **ALWAYS** uses write permissions. The navigator can edit files in its knowledge base.

### Starting a Conversation with Write Access

1. Generate a session UUID:
\`\`\`bash
UUID=$(python -c "import uuid; print(uuid.uuid4())")
\`\`\`

2. Start conversation with write permissions:
\`\`\`bash
cd "${navPath}" && claude -p --session-id "$UUID" --permission-mode acceptEdits "$message"
\`\`\`

### Continuing a Conversation

\`\`\`bash
cd "${navPath}" && claude --resume "$UUID" -p --permission-mode acceptEdits "$message"
\`\`\`

## Conversation Template

When updating the navigator, provide:
1. **What changed** - What implementation work was done
2. **Where to update** - Which documents should be updated
3. **Status/Progress** - Current status or issues encountered

Example:
\`\`\`
Hi ${config.navigatorName}! I've completed work on [feature/fix].

Changes made:
- [list of changes]

Issues encountered:
- [any problems or blockers]

Please update the following documents:
- [document 1]: Add section about [topic]
- [document 2]: Update status to [status]
\`\`\`

## Common Use Cases

### Reporting Implementation Progress
\`\`\`bash
UUID=$(python -c "import uuid; print(uuid.uuid4())")
cd "${navPath}" && claude -p --session-id "$UUID" --permission-mode acceptEdits \\
  "I've implemented feature X. Please update the documentation to reflect these changes: [details]"
\`\`\`

### Logging Issues
\`\`\`bash
cd "${navPath}" && claude -p --permission-mode acceptEdits \\
  "Encountered an error while deploying: [error details]. Please document this in troubleshooting."
\`\`\`

### Creating Status Reports
\`\`\`bash
cd "${navPath}" && claude -p --permission-mode acceptEdits \\
  "Create a status report for this week's work: [summary of completed tasks]"
\`\`\`

### Adding New Documentation
\`\`\`bash
cd "${navPath}" && claude -p --permission-mode acceptEdits \\
  "Add a new guide for [topic] covering: [key points]"
\`\`\`

## Best Practices

1. **Be Specific** - Clearly state what needs to be updated and where
2. **Provide Context** - Explain why changes are needed
3. **Review Changes** - Check the navigator's edits before accepting
4. **Use Structured Updates** - Organize information logically
5. **Track Sessions** - Use UUIDs to maintain context across updates

## File Organization

The navigator will typically update files in:
- \`knowledge/\` - Documentation and guides
- \`system-configuration.md\` - Configuration settings
- Progress logs and status reports (created as needed)

## Important Notes

- Navigator location: \`${navPath}\`
- **Write permissions are ALWAYS enabled** for this skill
- Each conversation needs a unique UUID for session tracking
- Changes are made directly to the knowledge base
- Review edits before committing to version control
- Use this skill for reporting back to the navigator, not just querying it
`;
}

/**
 * Create a global skill for a navigator
 *
 * @param config - Skill configuration
 * @param options - Options for skill creation
 * @returns Path to the created skill directory, or null if skipped
 */
export async function createNavigatorSkill(
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const askSkillName = getSkillName(config.navigatorName);
  const updateSkillName = getUpdateSkillName(config.navigatorName);
  const skillsDir = getGlobalSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  // Ensure skills directory exists
  fs.mkdirSync(skillsDir, { recursive: true });

  // Create "ask" skill
  if (skillExists(askSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`⏭️  Skill "${askSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    fs.mkdirSync(askSkillDir, { recursive: true });
    const askSkillContent = generateSkillContent(config);
    fs.writeFileSync(path.join(askSkillDir, "SKILL.md"), askSkillContent);
    if (!options.quiet) {
      console.log(`✓ Created global skill: ${askSkillName}`);
    }
  }

  // Create "update" skill
  if (skillExists(updateSkillName) && !options.force) {
    if (!options.quiet) {
      console.log(`⏭️  Skill "${updateSkillName}" already exists (use --force to overwrite)`);
    }
  } else {
    fs.mkdirSync(updateSkillDir, { recursive: true });
    const updateSkillContent = generateUpdateSkillContent(config);
    fs.writeFileSync(path.join(updateSkillDir, "SKILL.md"), updateSkillContent);
    if (!options.quiet) {
      console.log(`✓ Created global skill: ${updateSkillName}`);
    }
  }

  return askSkillDir;
}

/**
 * Remove a navigator skill (both ask and update skills)
 */
export function removeNavigatorSkill(
  navigatorName: string,
  options: { quiet?: boolean } = {}
): boolean {
  const askSkillName = getSkillName(navigatorName);
  const updateSkillName = getUpdateSkillName(navigatorName);
  const skillsDir = getGlobalSkillsDir();
  const askSkillDir = path.join(skillsDir, askSkillName);
  const updateSkillDir = path.join(skillsDir, updateSkillName);

  let removedAny = false;

  // Remove ask skill
  if (fs.existsSync(askSkillDir)) {
    fs.rmSync(askSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`✓ Removed skill: ${askSkillName}`);
    }
    removedAny = true;
  }

  // Remove update skill
  if (fs.existsSync(updateSkillDir)) {
    fs.rmSync(updateSkillDir, { recursive: true, force: true });
    if (!options.quiet) {
      console.log(`✓ Removed skill: ${updateSkillName}`);
    }
    removedAny = true;
  }

  if (!removedAny && !options.quiet) {
    console.log(`⚠️  No skills found for navigator "${navigatorName}"`);
  }

  return removedAny;
}
