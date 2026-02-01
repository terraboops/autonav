/**
 * README.md template generator
 */

import type { NavigatorVars } from "./types.js";

export function generateReadme(vars: NavigatorVars): string {
  const { name, description = "A knowledge navigator" } = vars;

  return `# ${name}

${description}

## Structure

- \`CLAUDE.md\` - System prompt and navigator instructions
- \`config.json\` - Navigator configuration
- \`knowledge/\` - Documentation and knowledge base
- \`.claude/\` - Plugin configurations and runtime state

## Usage

Query this navigator using the Autonav CLI:

\`\`\`bash
autonav query ${name} "your question here"
\`\`\`

Or start an interactive chat session:

\`\`\`bash
autonav chat ${name}
\`\`\`

## Adding Knowledge

Add documentation files to the \`knowledge/\` directory. The navigator will use these files to answer questions.

## Configuration

Plugin configurations live in \`.claude/plugins.json\`. You can configure:
- Slack integration
- GitHub integration
- File watching
- And more...

The navigator can self-configure based on your requests during conversations.
`;
}
