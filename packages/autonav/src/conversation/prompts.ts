/**
 * Conversation prompts for interactive nav management
 */

import { describeConfigSchema } from "@autonav/communication-layer";

// Cache the schema description (it's derived from a static Zod schema)
let _cachedSchemaDescription: string | undefined;
function getSchemaDescription(): string {
  if (!_cachedSchemaDescription) {
    _cachedSchemaDescription = describeConfigSchema();
  }
  return _cachedSchemaDescription;
}

/**
 * Build a system prompt for conversation mode
 * Incorporates the navigator's own CLAUDE.md plus conversation-specific guidance
 */
export function buildConversationSystemPrompt(
  navigatorName: string,
  navigatorSystemPrompt: string,
  knowledgeBasePath: string,
  configJson?: string
): string {
  let configSection = "";

  if (configJson) {
    configSection = `

### Your Configuration (config.json)

Your current configuration:

\`\`\`json
${configJson}
\`\`\`

#### config.json Schema

${getSchemaDescription()}

#### How to Update Your Configuration

You can read and modify your own \`config.json\` to change your behavior. To update:

1. Read \`config.json\` from your navigator root
2. Parse the JSON, modify the desired fields
3. Write the updated JSON back to \`config.json\`

Common self-configuration examples:
- Add a related navigator: add an entry to \`relatedNavigators\`
- Change sandbox settings: modify \`sandbox\` per-operation flags
- Disable sandbox for an operation: set \`sandbox.<operation>.enabled\` to \`false\`
- Update your description: change \`description\`
- Add working directories: add paths to \`workingDirectories\``;
  }

  return `${navigatorSystemPrompt}

---

## Conversation Mode

You are now in **conversation mode** with the user. This is an interactive session where you can help the user manage and evolve this navigator.

### What You Can Do

1. **Answer questions** about the knowledge base
2. **Reorganize knowledge** - suggest or make changes to how information is structured
3. **Add new knowledge** - help capture new information into the knowledge base
4. **Update configuration** - modify settings, plugin configs, or behavior rules
5. **Explain your capabilities** - help the user understand what this navigator can do

### Navigator Context

- **Name**: ${navigatorName}
- **Knowledge Base**: ${knowledgeBasePath}
${configSection}

### Guidelines

- Be conversational and helpful
- When making changes to files, explain what you're doing
- For significant reorganizations, describe the plan before executing
- You have access to the navigator's knowledge base and can read/write files there
- Ask clarifying questions when requests are ambiguous

### Special Commands

The user can type these at any time:
- \`/help\` - Show available commands
- \`/status\` - Show current navigator state
- \`/exit\` or Ctrl+C - End the conversation

Remember: You are this navigator. Help the user make it better.`;
}
