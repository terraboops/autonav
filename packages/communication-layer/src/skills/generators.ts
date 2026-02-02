import { getSkillName, getUpdateSkillName } from './utils.js';
import type { SkillConfig } from './types.js';

/**
 * Generate the ask skill content for a navigator
 */
export function generateSkillContent(config: SkillConfig): string {
  const skillName = getSkillName(config.navigatorName);
  const navPath = config.navigatorPath;

  return `---
name: ${skillName}
description: Query ${config.navigatorName} navigator about ${config.description}. Use when user asks to "ask ${config.navigatorName}" or needs information from this knowledge base.
---

# Ask ${config.navigatorName}

Query the **${config.navigatorName}** navigator for information.

**Navigator Location**: \`${navPath}\`

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ''}
${config.audience ? `**Audience**: ${config.audience}\n` : ''}

## How Claude Code Should Interact

**Navigator Authority**: Treat this navigator as the authoritative expert on its domain. The navigator is the arbiter of what needs doing in its area.

**Tone of Interaction**:
- Ask questions collaboratively, discuss topics rather than just querying mechanically
- Trust the navigator's expertise and responses
- If you suspect a hallucination, you may explicitly accuse the navigator (e.g., "Are you hallucinating? This seems incorrect.")
- ONLY when explicitly accused should the navigator doubt itself and reconsider

**Avoid**:
- Reading entire files directly when you could ask the navigator
- Second-guessing the navigator's answers without cause
- Treating the navigator as just a search engine

## How to Use

**RFC-2119 Requirements:**

You MUST run \`autonav query\` from your current working directory.

You MUST NOT change directory to the navigator location.

You MUST use the absolute navigator path:

\`\`\`bash
autonav query "${navPath}" "your question here"
\`\`\`

**Forbidden (MUST NOT):**
- ❌ \`cd ${navPath} && autonav query . "question"\`
- ❌ Changing your working directory to the navigator
- ❌ Using relative paths to the navigator

**Required (MUST):**
- ✅ Use absolute path: \`autonav query "${navPath}" "question"\`
- ✅ Stay in your current working directory
- ✅ Let autonav handle navigator location

**Optional (MAY):**
- You MAY use environment variables or shell expansions in the path
- You MAY wrap the command in scripts, but MUST preserve the absolute path

The navigator will provide grounded answers with sources from its knowledge base.

**Troubleshooting**: If this skill fails to execute, the navigator may need health checks. Run:

\`\`\`bash
autonav mend "${navPath}" --auto-fix
\`\`\`

## What This Navigator Knows

This navigator specializes in ${config.scope || 'its configured domain'} and follows strict grounding rules:
- Always cites sources from the knowledge base
- Never invents information
- Acknowledges uncertainty with confidence scores
- Only references files that actually exist
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
description: Update ${config.navigatorName} navigator's documentation and knowledge base. Use when reporting implementation progress, documenting issues, or updating knowledge about ${config.description}.
---

# Update ${config.navigatorName}

Update the **${config.navigatorName}** navigator's documentation and knowledge base.

**Navigator Location**: \`${navPath}\`

${config.description}

${config.scope ? `**Scope**: ${config.scope}\n` : ''}
${config.audience ? `**Audience**: ${config.audience}\n` : ''}

## When to Use

Use this skill to:
- Report implementation progress or issues
- Update documentation after making changes
- Add new knowledge or learnings
- Document troubleshooting steps
- Create status reports or logs

## How to Use

**RFC-2119 Requirements:**

You MUST run \`autonav update\` from your current working directory.

You MUST NOT change directory to the navigator location.

You MUST use the absolute navigator path:

\`\`\`bash
autonav update "${navPath}" "your update message"
\`\`\`

**Forbidden (MUST NOT):**
- ❌ \`cd ${navPath} && autonav update . "message"\`
- ❌ Changing your working directory to the navigator
- ❌ Using relative paths to the navigator

**Required (MUST):**
- ✅ Use absolute path: \`autonav update "${navPath}" "message"\`
- ✅ Stay in your current working directory
- ✅ Let autonav handle navigator location

**Optional (MAY):**
- You MAY use environment variables or shell expansions in the path
- You MAY wrap the command in scripts, but MUST preserve the absolute path

**Troubleshooting**: If this skill fails to execute, the navigator may need health checks. Run:

\`\`\`bash
autonav mend "${navPath}" --auto-fix
\`\`\`

**Example updates:**

Report progress:
\`\`\`bash
autonav update "${navPath}" "Implemented user authentication. Added OAuth2 flow with Google. See src/auth/ for details."
\`\`\`

Document an issue:
\`\`\`bash
autonav update "${navPath}" "Database connection timeout issue: Increased pool size to 20 and added retry logic. Fixed in commit abc123."
\`\`\`

Add learnings:
\`\`\`bash
autonav update "${navPath}" "Found that Lambda cold starts were causing 502s. Solution: provisioned concurrency of 5 instances. Response times now <100ms."
\`\`\`
`;
}
