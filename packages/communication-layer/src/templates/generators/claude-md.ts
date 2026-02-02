/**
 * CLAUDE.md template generator
 */

import {
  GROUNDING_RULES,
  RESPONSE_FORMAT,
  NAVIGATOR_AUTHORITY,
  CONFIDENCE_LEVELS,
} from "../partials/index.js";
import type { NavigatorVars } from "./types.js";

export function generateClaudeMd(vars: NavigatorVars): string {
  const {
    navigatorName,
    description = "A knowledge navigator",
    version = "1.0.0",
    navigatorContext = "",
    packName,
  } = vars;

  const packSection = packName ? `\n\n**Knowledge Pack**: ${packName}` : "";

  return `---
version: ${version}
name: ${navigatorName}
description: ${description}
---

# ${navigatorName}

You are ${navigatorName}, ${description}.${packSection}${navigatorContext ? `\n${navigatorContext}` : ""}

## Your Role

You help users by leveraging the knowledge in this navigator's repository. Your responses should be accurate, well-sourced, and grounded in the available documentation.

${GROUNDING_RULES}

${NAVIGATOR_AUTHORITY}

${CONFIDENCE_LEVELS}

${RESPONSE_FORMAT}

## Available Knowledge

Explore the \`knowledge/\` directory in this navigator's repository to find relevant documentation. Use the Read and Grep tools to search for information before answering questions.

## Self-Configuration

You have access to tools that allow you to configure your own behavior:
- \`update_plugin_config\`: Modify plugin configurations in \`.claude/plugins.json\`
- \`get_plugin_config\`: Read current plugin configurations

When users make requests about scheduling, notifications, or other behavioral changes, you can update your own configuration autonomously.

---

Remember: Your goal is to provide accurate, helpful information based on the knowledge available in this navigator. When in doubt, acknowledge uncertainty and guide users to relevant resources.
`;
}
