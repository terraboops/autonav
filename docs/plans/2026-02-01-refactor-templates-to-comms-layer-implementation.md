# Refactor Templates and Skills to Communication Layer - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all navigator templates and skill management from autonav core to communication-layer, establishing single source of truth and adding RFC-2119 requirements to prevent directory changes.

**Architecture:** Extract template partials as constants, create composition functions in communication-layer, move all skill management logic to communication-layer/skills/, update autonav to import and use these functions.

**Tech Stack:** TypeScript, Zod schemas, Node.js fs operations

---

## Phase 1: Create Communication-Layer Template Infrastructure

### Task 1: Create Template Partials Module

**Files:**
- Create: `packages/communication-layer/src/templates/partials/grounding-rules.ts`
- Create: `packages/communication-layer/src/templates/partials/response-format.ts`
- Create: `packages/communication-layer/src/templates/partials/navigator-authority.ts`
- Create: `packages/communication-layer/src/templates/partials/confidence-levels.ts`
- Create: `packages/communication-layer/src/templates/partials/index.ts`

**Step 1: Create grounding-rules partial**

Create `packages/communication-layer/src/templates/partials/grounding-rules.ts`:

```typescript
/**
 * Core grounding rules for navigators
 */
export const GROUNDING_RULES = `## Grounding Rules

You MUST follow these rules when answering questions:

1. **Always cite sources**: Every answer must reference specific files from the knowledge base
2. **Quote directly**: Use exact excerpts from files, don't paraphrase
3. **Never invent**: If information isn't in the knowledge base, say so clearly
4. **File paths must exist**: Only cite files that actually exist in the knowledge-base directory
5. **Be specific**: Include section headings or line numbers when citing sources
6. **Acknowledge uncertainty**: If you're not confident, state that explicitly

**Never do this**:
- Don't make up commands, file paths, or configurations
- Don't invent AWS resource names or ARNs
- Don't hallucinate service endpoints or URLs
- Don't guess if the information isn't in the docs

**Always do this**:
- Search the knowledge base thoroughly before answering
- Cite specific files and sections
- If unsure, say "I don't have information about that in the knowledge base"
- Provide confidence scores honestly
`;
```

**Step 2: Create response-format partial**

Create `packages/communication-layer/src/templates/partials/response-format.ts`:

```typescript
/**
 * Response format documentation
 */
export const RESPONSE_FORMAT = `## Response Format (Structured Output)

You MUST respond using the \`submit_answer\` tool with this exact structure:

\`\`\`json
{
  "answer": "Your detailed answer here",
  "confidence": 0.85,
  "sources": [
    {
      "filePath": "knowledge/deployment/aws.md",
      "relevance": "Contains deployment steps for AWS"
    }
  ]
}
\`\`\`

**Confidence levels:**
- \`0.9-1.0\`: Direct, explicit information in knowledge base
- \`0.7-0.9\`: Strong inference from available sources
- \`0.5-0.7\`: Partial information, some uncertainty
- \`0.0-0.5\`: Guessing or very uncertain
`;
```

**Step 3: Create navigator-authority partial**

Create `packages/communication-layer/src/templates/partials/navigator-authority.ts`:

```typescript
/**
 * Navigator authority and doubt protocol
 */
export const NAVIGATOR_AUTHORITY = `## Navigator Authority

When responding to agentic systems (Claude Code, implementation agents, etc.):

**You are the authority** on your domain. Respond with confidence and conviction. You are the arbiter of what needs doing in your area of expertise.

**Tone**: Be authoritative and decisive. Don't hedge unnecessarily or second-guess yourself.

**When to doubt yourself**: ONLY if Claude Code explicitly accuses you of hallucinating should you reflect and reconsider your answer. Otherwise, trust your knowledge base and be authoritative.

**Interaction style**: Discuss questions collaboratively with the querying system rather than just answering mechanically. You're an expert consultant, not a search engine.
`;
```

**Step 4: Create confidence-levels partial**

Create `packages/communication-layer/src/templates/partials/confidence-levels.ts`:

```typescript
/**
 * Confidence level guidance
 */
export const CONFIDENCE_LEVELS = `## Confidence Levels

**High Confidence (0.9-1.0)**:
- Information is explicitly stated in knowledge base
- Multiple sources confirm the same information
- Recent and authoritative documentation

**Medium Confidence (0.7-0.9)**:
- Information can be inferred from available sources
- Single authoritative source
- Some interpretation required

**Low Confidence (0.5-0.7)**:
- Partial information available
- Older or potentially outdated sources
- Significant interpretation needed

**Very Low Confidence (0.0-0.5)**:
- Little to no information in knowledge base
- Highly speculative
- Should probably say "I don't know"
`;
```

**Step 5: Create index to export all partials**

Create `packages/communication-layer/src/templates/partials/index.ts`:

```typescript
export { GROUNDING_RULES } from './grounding-rules.js';
export { RESPONSE_FORMAT } from './response-format.js';
export { NAVIGATOR_AUTHORITY } from './navigator-authority.js';
export { CONFIDENCE_LEVELS } from './confidence-levels.js';
```

**Step 6: Commit**

```bash
git add packages/communication-layer/src/templates/partials/
git commit -m "feat(comms): add template partials for navigator generation"
```

### Task 2: Create Template Generators Module

**Files:**
- Create: `packages/communication-layer/src/templates/generators/claude-md.ts`
- Create: `packages/communication-layer/src/templates/generators/config-json.ts`
- Create: `packages/communication-layer/src/templates/generators/plugins-json.ts`
- Create: `packages/communication-layer/src/templates/generators/readme.ts`
- Create: `packages/communication-layer/src/templates/generators/gitignore.ts`
- Create: `packages/communication-layer/src/templates/generators/index.ts`
- Create: `packages/communication-layer/src/templates/generators/types.ts`

**Step 1: Create types for template variables**

Create `packages/communication-layer/src/templates/generators/types.ts`:

```typescript
/**
 * Variables for template generation
 */
export interface NavigatorVars {
  name: string;
  description?: string;
  scope?: string;
  audience?: string;
  knowledgeBasePath?: string;
  systemConfiguration?: string;
  knowledgePack?: {
    name: string;
    version: string;
  };
  customInstructions?: string;
}
```

**Step 2: Create CLAUDE.md generator**

Create `packages/communication-layer/src/templates/generators/claude-md.ts`:

```typescript
import {
  GROUNDING_RULES,
  RESPONSE_FORMAT,
  NAVIGATOR_AUTHORITY,
  CONFIDENCE_LEVELS,
} from '../partials/index.js';
import type { NavigatorVars } from './types.js';

/**
 * Generate CLAUDE.md content for a navigator
 */
export function generateClaudeMd(vars: NavigatorVars): string {
  const {
    name,
    description = 'Knowledge navigator',
    scope,
    audience,
    knowledgeBasePath = './knowledge',
    systemConfiguration,
    knowledgePack,
    customInstructions = '',
  } = vars;

  const scopeSection = scope ? `\n**Scope**: ${scope}\n` : '';
  const audienceSection = audience ? `\n**Audience**: ${audience}\n` : '';

  const systemConfigSection = systemConfiguration
    ? `\nIf a \`${systemConfiguration}\` file exists, read it first. It contains domain-specific instructions, scope definitions, and response guidelines that override defaults.\n`
    : '\nIf a \`system-configuration.md\` file exists, read it first. It contains domain-specific instructions, scope definitions, and response guidelines that override defaults.\n';

  const knowledgePackSection = knowledgePack
    ? `\nYou are equipped with the **${knowledgePack.name}** knowledge pack (v${knowledgePack.version}).\n`
    : '';

  return `# Navigator: ${name}

You are a specialized knowledge navigator created with Autonav. ${description}
${scopeSection}${audienceSection}
${systemConfigSection}${knowledgePackSection}
Your knowledge is located at: \`${knowledgeBasePath}\`

When answering questions:
- Always cite specific files and sections
- Use exact headings and references
- If you don't know something, say so explicitly
- Never make up information not in your knowledge base

${GROUNDING_RULES}

${RESPONSE_FORMAT}

${CONFIDENCE_LEVELS}

${NAVIGATOR_AUTHORITY}

${customInstructions}
`.trim();
}
```

**Step 3: Create config.json generator**

Create `packages/communication-layer/src/templates/generators/config-json.ts`:

```typescript
import type { NavigatorVars } from './types.js';

/**
 * Generate config.json content for a navigator
 */
export function generateConfigJson(vars: NavigatorVars): string {
  const {
    name,
    description,
    scope,
    audience,
    knowledgeBasePath = 'knowledge',
    systemConfiguration,
    knowledgePack,
  } = vars;

  const config: any = {
    version: '1.4.0',
    name,
    created: new Date().toISOString(),
    knowledgeBase: knowledgeBasePath,
    plugins: {
      configFile: '.claude/plugins.json',
    },
  };

  if (description) {
    config.description = description;
  }

  if (scope) {
    config.scope = scope;
  }

  if (audience) {
    config.audience = audience;
  }

  if (systemConfiguration) {
    config.systemConfiguration = systemConfiguration;
  }

  if (knowledgePack) {
    config.knowledgePack = {
      ...knowledgePack,
      installedAt: new Date().toISOString(),
    };
  } else {
    config.knowledgePack = null;
  }

  return JSON.stringify(config, null, 2);
}
```

**Step 4: Create plugins.json generator**

Create `packages/communication-layer/src/templates/generators/plugins-json.ts`:

```typescript
/**
 * Generate plugins.json content
 */
export function generatePluginsJson(): string {
  const config = {
    slack: {
      enabled: false,
      workspace: '',
      channels: [],
      threadNotifications: true,
      summaryFrequency: 'daily',
    },
    signal: {
      enabled: false,
      phoneNumber: '',
      checkInSchedule: 'never',
      notificationTypes: [],
    },
    github: {
      enabled: false,
      repositories: [],
      issueLabels: [],
      autoRespond: false,
    },
    email: {
      enabled: false,
      addresses: [],
      digestFrequency: 'weekly',
    },
  };

  return JSON.stringify(config, null, 2);
}
```

**Step 5: Create README generator**

Create `packages/communication-layer/src/templates/generators/readme.ts`:

```typescript
import type { NavigatorVars } from './types.js';

/**
 * Generate README.md content for a navigator
 */
export function generateReadme(vars: NavigatorVars): string {
  const {
    name,
    description = 'Knowledge navigator',
    scope,
    audience,
  } = vars;

  const scopeSection = scope
    ? `\n## Scope\n\n${scope}\n`
    : '';

  const audienceSection = audience
    ? `\n## Audience\n\n${audience}\n`
    : '';

  return `# ${name}

${description}
${scopeSection}${audienceSection}
## Usage

Query this navigator:

\`\`\`bash
autonav query . "your question here"
\`\`\`

Update this navigator's knowledge:

\`\`\`bash
autonav update . "your update message"
\`\`\`

## Structure

- \`knowledge/\` - Knowledge base documents
- \`CLAUDE.md\` - Navigator instructions and grounding rules
- \`config.json\` - Navigator configuration
- \`.claude/\` - Plugin configurations
`.trim();
}
```

**Step 6: Create .gitignore generator**

Create `packages/communication-layer/src/templates/generators/gitignore.ts`:

```typescript
/**
 * Generate .gitignore content for a navigator
 */
export function generateGitignore(): string {
  return `# Dependencies
node_modules/
.npm/

# Environment
.env
.env.local

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
npm-debug.log*

# Temporary files
*.tmp
.cache/
`;
}
```

**Step 7: Create generators index**

Create `packages/communication-layer/src/templates/generators/index.ts`:

```typescript
export { generateClaudeMd } from './claude-md.js';
export { generateConfigJson } from './config-json.js';
export { generatePluginsJson } from './plugins-json.js';
export { generateReadme } from './readme.js';
export { generateGitignore } from './gitignore.js';
export type { NavigatorVars } from './types.js';
```

**Step 8: Commit**

```bash
git add packages/communication-layer/src/templates/generators/
git commit -m "feat(comms): add template generators for navigator scaffolding"
```

### Task 3: Create Skills Module in Communication-Layer

**Files:**
- Create: `packages/communication-layer/src/skills/types.ts`
- Create: `packages/communication-layer/src/skills/utils.ts`
- Create: `packages/communication-layer/src/skills/generators.ts`
- Create: `packages/communication-layer/src/skills/management.ts`
- Create: `packages/communication-layer/src/skills/index.ts`

**Step 1: Create skill types**

Create `packages/communication-layer/src/skills/types.ts`:

```typescript
/**
 * Configuration for generating skills
 */
export interface SkillConfig {
  navigatorName: string;
  navigatorPath: string;
  description: string;
  scope?: string;
  audience?: string;
}

/**
 * Result of symlinking a skill to global directory
 */
export interface SymlinkResult {
  created: boolean;
  existed: boolean;
  path: string;
  message: string;
}
```

**Step 2: Copy skill utils from autonav**

Create `packages/communication-layer/src/skills/utils.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Get the global skills directory (~/.claude/skills)
 */
export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

/**
 * Get the local skills directory for a navigator
 */
export function getLocalSkillsDir(navigatorPath: string): string {
  return path.join(navigatorPath, '.autonav', 'skills');
}

/**
 * Get the path to a specific local skill
 */
export function getLocalSkillPath(navigatorPath: string, skillName: string): string {
  return path.join(getLocalSkillsDir(navigatorPath), skillName);
}

/**
 * Check if a skill exists in the global directory
 */
export function skillExists(skillName: string): boolean {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  return fs.existsSync(skillPath);
}

/**
 * Check if a skill exists in the local directory
 */
export function localSkillExists(navigatorPath: string, skillName: string): boolean {
  const skillPath = getLocalSkillPath(navigatorPath, skillName);
  return fs.existsSync(skillPath);
}

/**
 * Check if a global skill is a symlink
 */
export function isSkillSymlink(skillName: string): boolean {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  try {
    const stats = fs.lstatSync(skillPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the target of a skill symlink
 */
export function getSkillSymlinkTarget(skillName: string): string | null {
  const skillPath = path.join(getGlobalSkillsDir(), skillName);
  try {
    return fs.readlinkSync(skillPath);
  } catch {
    return null;
  }
}

/**
 * Get the skill name for a navigator (ask-<name>)
 */
export function getSkillName(navigatorName: string): string {
  return `ask-${navigatorName}`;
}

/**
 * Get the update skill name for a navigator (update-<name>)
 */
export function getUpdateSkillName(navigatorName: string): string {
  return `update-${navigatorName}`;
}
```

**Step 3: Commit skill utils**

```bash
git add packages/communication-layer/src/skills/types.ts packages/communication-layer/src/skills/utils.ts
git commit -m "feat(comms): add skill utilities and types"
```

**Step 4: Create skill generators with RFC-2119**

Create `packages/communication-layer/src/skills/generators.ts`:

```typescript
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
```

**Step 5: Commit skill generators**

```bash
git add packages/communication-layer/src/skills/generators.ts
git commit -m "feat(comms): add skill generators with RFC-2119 requirements"
```

**Step 6: Create skill management functions**

Create `packages/communication-layer/src/skills/management.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  getSkillName,
  getUpdateSkillName,
} from './utils.js';
import { generateSkillContent, generateUpdateSkillContent } from './generators.js';
import type { SkillConfig, SymlinkResult } from './types.js';

/**
 * Create skill locally in navigator's .autonav/skills directory
 */
export async function createLocalSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const skillName = getSkillName(config.navigatorName);
  const localSkillsDir = getLocalSkillsDir(navigatorPath);
  const localSkillDir = path.join(localSkillsDir, skillName);

  // Check if skill already exists locally
  if (localSkillExists(navigatorPath, skillName) && !options.force) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" already exists locally (use --force to overwrite)`);
    }
    return null;
  }

  // Ensure local skills directory exists
  fs.mkdirSync(localSkillsDir, { recursive: true });

  // Create local skill directory
  fs.mkdirSync(localSkillDir, { recursive: true });

  // Generate and write SKILL.md
  const skillContent = generateSkillContent(config);
  fs.writeFileSync(path.join(localSkillDir, 'SKILL.md'), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
}

/**
 * Create update skill locally in navigator's .autonav/skills directory
 */
export async function createLocalUpdateSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<string | null> {
  const skillName = getUpdateSkillName(config.navigatorName);
  const localSkillsDir = getLocalSkillsDir(navigatorPath);
  const localSkillDir = path.join(localSkillsDir, skillName);

  // Check if skill already exists locally
  if (localSkillExists(navigatorPath, skillName) && !options.force) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" already exists locally (use --force to overwrite)`);
    }
    return null;
  }

  // Ensure local skills directory exists
  fs.mkdirSync(localSkillsDir, { recursive: true });

  // Create local skill directory
  fs.mkdirSync(localSkillDir, { recursive: true });

  // Generate and write SKILL.md
  const skillContent = generateUpdateSkillContent(config);
  fs.writeFileSync(path.join(localSkillDir, 'SKILL.md'), skillContent);

  if (!options.quiet) {
    console.log(`Created local skill: ${skillName}`);
  }

  return localSkillDir;
}

/**
 * Create a symlink from global skills directory to local skill
 */
export function symlinkSkillToGlobal(
  localSkillPath: string,
  skillName: string,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): SymlinkResult {
  const globalSkillsDir = getGlobalSkillsDir();
  const globalSkillPath = path.join(globalSkillsDir, skillName);

  // Ensure global skills directory exists
  fs.mkdirSync(globalSkillsDir, { recursive: true });

  // Check if skill already exists globally
  if (skillExists(skillName)) {
    if (!options.force) {
      return {
        created: false,
        existed: true,
        path: globalSkillPath,
        message: `Skill "${skillName}" already exists globally`,
      };
    }
    // Remove existing symlink/directory
    fs.rmSync(globalSkillPath, { recursive: true, force: true });
  }

  // Create symlink
  fs.symlinkSync(localSkillPath, globalSkillPath);

  if (!options.quiet) {
    console.log(`Symlinked skill to global: ${skillName}`);
  }

  return {
    created: true,
    existed: false,
    path: globalSkillPath,
    message: `Created symlink: ${globalSkillPath} -> ${localSkillPath}`,
  };
}

/**
 * Create local skill and symlink to global
 */
export async function createAndSymlinkSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<{ localPath: string | null; symlinkResult: SymlinkResult | null }> {
  // Create local skill
  const localPath = await createLocalSkill(navigatorPath, config, options);

  if (!localPath) {
    return { localPath: null, symlinkResult: null };
  }

  // Symlink to global
  const skillName = getSkillName(config.navigatorName);
  const symlinkResult = symlinkSkillToGlobal(localPath, skillName, options);

  return { localPath, symlinkResult };
}

/**
 * Create local update skill and symlink to global
 */
export async function createAndSymlinkUpdateSkill(
  navigatorPath: string,
  config: SkillConfig,
  options: {
    force?: boolean;
    quiet?: boolean;
  } = {}
): Promise<{ localPath: string | null; symlinkResult: SymlinkResult | null }> {
  // Create local update skill
  const localPath = await createLocalUpdateSkill(navigatorPath, config, options);

  if (!localPath) {
    return { localPath: null, symlinkResult: null };
  }

  // Symlink to global
  const skillName = getUpdateSkillName(config.navigatorName);
  const symlinkResult = symlinkSkillToGlobal(localPath, skillName, options);

  return { localPath, symlinkResult };
}

/**
 * Remove a skill symlink from global directory
 */
export function removeSkillSymlink(
  skillName: string,
  options: {
    quiet?: boolean;
  } = {}
): boolean {
  const globalSkillPath = path.join(getGlobalSkillsDir(), skillName);

  if (!skillExists(skillName)) {
    if (!options.quiet) {
      console.log(`Skill "${skillName}" does not exist globally`);
    }
    return false;
  }

  fs.rmSync(globalSkillPath, { recursive: true, force: true });

  if (!options.quiet) {
    console.log(`Removed global skill symlink: ${skillName}`);
  }

  return true;
}

/**
 * Discover all local skills in a navigator
 */
export function discoverLocalSkills(navigatorPath: string): string[] {
  const localSkillsDir = getLocalSkillsDir(navigatorPath);

  if (!fs.existsSync(localSkillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(localSkillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && (entry.name.startsWith('ask-') || entry.name.startsWith('update-')))
    .map((entry) => entry.name);
}
```

**Step 7: Create skills index**

Create `packages/communication-layer/src/skills/index.ts`:

```typescript
// Types
export type { SkillConfig, SymlinkResult } from './types.js';

// Utilities
export {
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  isSkillSymlink,
  getSkillSymlinkTarget,
  getSkillName,
  getUpdateSkillName,
} from './utils.js';

// Generators
export {
  generateSkillContent,
  generateUpdateSkillContent,
} from './generators.js';

// Management
export {
  createLocalSkill,
  createLocalUpdateSkill,
  symlinkSkillToGlobal,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  removeSkillSymlink,
  discoverLocalSkills,
} from './management.js';
```

**Step 8: Commit skill management**

```bash
git add packages/communication-layer/src/skills/management.ts packages/communication-layer/src/skills/index.ts
git commit -m "feat(comms): add skill management functions"
```

### Task 4: Update Communication-Layer Main Index

**Files:**
- Modify: `packages/communication-layer/src/index.ts`

**Step 1: Add template and skill exports**

Edit `packages/communication-layer/src/index.ts`, add at the end:

```typescript
// Template generation
export {
  // Partials
  GROUNDING_RULES,
  RESPONSE_FORMAT,
  NAVIGATOR_AUTHORITY,
  CONFIDENCE_LEVELS,
} from './templates/partials/index.js';

export {
  // Generators
  generateClaudeMd,
  generateConfigJson,
  generatePluginsJson,
  generateReadme,
  generateGitignore,
  type NavigatorVars,
} from './templates/generators/index.js';

// Skill management
export {
  // Types
  type SkillConfig,
  type SymlinkResult,
  // Utilities
  getGlobalSkillsDir,
  getLocalSkillsDir,
  getLocalSkillPath,
  skillExists,
  localSkillExists,
  isSkillSymlink,
  getSkillSymlinkTarget,
  getSkillName,
  getUpdateSkillName,
  // Generators
  generateSkillContent,
  generateUpdateSkillContent,
  // Management
  createLocalSkill,
  createLocalUpdateSkill,
  symlinkSkillToGlobal,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  removeSkillSymlink,
  discoverLocalSkills,
} from './skills/index.js';
```

**Step 2: Build communication-layer**

```bash
cd packages/communication-layer && npm run build
```

Expected: Build succeeds, all exports available

**Step 3: Commit**

```bash
git add packages/communication-layer/src/index.ts
git commit -m "feat(comms): export template and skill functions"
```

---

## Phase 2: Update Autonav to Use Communication-Layer

### Task 5: Update autonav Package Dependencies

**Files:**
- Modify: `packages/autonav/package.json`

**Step 1: Verify communication-layer dependency**

Check `packages/autonav/package.json` has:

```json
"dependencies": {
  "@autonav/communication-layer": "workspace:*"
}
```

Already exists, no change needed.

**Step 2: Rebuild autonav**

```bash
cd packages/autonav && npm install
```

Expected: Installs latest communication-layer with new exports

---

### Task 6: Update nav-init to Use Communication-Layer Templates

**Files:**
- Modify: `packages/autonav/src/cli/nav-init.ts`

**Step 1: Replace template imports**

Find and replace in `packages/autonav/src/cli/nav-init.ts`:

Old:
```typescript
import { loadTemplates, replaceTemplateVars } from "../templates/index.js";
import { createAndSymlinkSkill } from "../skill-generator/index.js";
```

New:
```typescript
import {
  generateClaudeMd,
  generateConfigJson,
  generatePluginsJson,
  generateReadme,
  generateGitignore,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  type NavigatorVars,
} from "@autonav/communication-layer";
```

**Step 2: Replace template usage in interactive init**

Find the section that writes templates (around line 450-500), replace:

Old:
```typescript
const templates = loadTemplates();

// Write CLAUDE.md
fs.writeFileSync(
  path.join(navigatorPath, "CLAUDE.md"),
  replaceTemplateVars(templates.claudeMd, vars)
);
```

New:
```typescript
const navVars: NavigatorVars = {
  name: navigatorName,
  description: finalAnalysis.purpose,
  scope: finalAnalysis.scope,
  audience: finalAnalysis.audience,
};

// Write CLAUDE.md
fs.writeFileSync(
  path.join(navigatorPath, "CLAUDE.md"),
  generateClaudeMd(navVars)
);
```

**Step 3: Replace config.json generation**

Replace:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, "config.json"),
  replaceTemplateVars(templates.configJson, vars)
);
```

With:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, "config.json"),
  generateConfigJson(navVars)
);
```

**Step 4: Replace plugins.json generation**

Replace:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, ".claude/plugins.json"),
  replaceTemplateVars(templates.pluginsJson, vars)
);
```

With:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, ".claude/plugins.json"),
  generatePluginsJson()
);
```

**Step 5: Replace README generation**

Replace:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, "README.md"),
  replaceTemplateVars(templates.readme, vars)
);
```

With:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, "README.md"),
  generateReadme(navVars)
);
```

**Step 6: Replace .gitignore generation**

Replace:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, ".gitignore"),
  templates.gitignore
);
```

With:
```typescript
fs.writeFileSync(
  path.join(navigatorPath, ".gitignore"),
  generateGitignore()
);
```

**Step 7: Update skill creation**

Skill creation should already use `createAndSymlinkSkill` - verify it's imported from communication-layer now.

**Step 8: Repeat for knowledge pack init section**

Find the knowledge pack initialization section (around line 850-950) and apply the same template replacements.

**Step 9: Test nav-init**

```bash
cd /tmp && autonav init test-nav-refactor
```

Expected: Creates navigator with new templates, RFC-2119 in skills

**Step 10: Commit**

```bash
git add packages/autonav/src/cli/nav-init.ts
git commit -m "feat(core): use communication-layer template generators in nav-init"
```

### Task 7: Update nav-mend to Use Communication-Layer Skills

**Files:**
- Modify: `packages/autonav/src/mend/index.ts`

**Step 1: Replace skill imports**

In `packages/autonav/src/mend/index.ts`, replace:

Old:
```typescript
import {
  getSkillName,
  getUpdateSkillName,
  localSkillExists,
  skillExists,
  isSkillSymlink,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  type SkillConfig,
} from "../skill-generator/index.js";
```

New:
```typescript
import {
  getSkillName,
  getUpdateSkillName,
  localSkillExists,
  skillExists,
  isSkillSymlink,
  createAndSymlinkSkill,
  createAndSymlinkUpdateSkill,
  type SkillConfig,
} from "@autonav/communication-layer";
```

**Step 2: Build and test**

```bash
npm run build
autonav mend /tmp/test-nav-refactor
```

Expected: Mend works, detects health correctly

**Step 3: Commit**

```bash
git add packages/autonav/src/mend/index.ts
git commit -m "feat(core): use communication-layer skills in mend"
```

### Task 8: Update Other Files Using Skills

**Files:**
- Modify: `packages/autonav/src/cli/nav-install.ts`
- Modify: `packages/autonav/src/cli/nav-uninstall.ts`

**Step 1: Update nav-install.ts**

Replace skill-generator imports with communication-layer imports:

Old:
```typescript
import { discoverLocalSkills, symlinkSkillToGlobal } from "../skill-generator/index.js";
```

New:
```typescript
import { discoverLocalSkills, symlinkSkillToGlobal } from "@autonav/communication-layer";
```

**Step 2: Update nav-uninstall.ts**

Replace skill-generator imports:

Old:
```typescript
import { discoverLocalSkills, removeSkillSymlink } from "../skill-generator/index.js";
```

New:
```typescript
import { discoverLocalSkills, removeSkillSymlink } from "@autonav/communication-layer";
```

**Step 3: Search for any other skill-generator imports**

```bash
grep -r "skill-generator" packages/autonav/src/ --include="*.ts"
```

Expected: No results (all migrated)

**Step 4: Build and test**

```bash
npm run build
autonav install /tmp/test-nav-refactor
autonav uninstall /tmp/test-nav-refactor
```

Expected: Both commands work

**Step 5: Commit**

```bash
git add packages/autonav/src/cli/nav-install.ts packages/autonav/src/cli/nav-uninstall.ts
git commit -m "feat(core): use communication-layer skills in install/uninstall"
```

---

## Phase 3: Cleanup Autonav

### Task 9: Delete Old Template Files

**Files:**
- Delete: `packages/autonav/src/templates/*.template`
- Delete: `packages/autonav/src/templates/index.ts`
- Delete: `packages/autonav/src/skill-generator/index.ts`

**Step 1: Remove template files**

```bash
rm -rf packages/autonav/src/templates/
```

**Step 2: Remove skill-generator directory**

```bash
rm -rf packages/autonav/src/skill-generator/
```

**Step 3: Update autonav index exports**

Edit `packages/autonav/src/index.ts`, remove:

```typescript
// Export templates utilities (for programmatic use)
export {
  loadTemplates,
  replaceTemplateVars,
  type Templates,
} from "./templates/index.js";
```

Templates are now exported from communication-layer, not autonav.

**Step 4: Build**

```bash
npm run build
```

Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(core): remove old templates and skill-generator (migrated to comms-layer)"
```

### Task 10: Delete Old Communication-Layer Legacy Templates

**Files:**
- Delete: `packages/communication-layer/src/templates/claude-md.template`
- Delete: `packages/communication-layer/src/templates/config-json.template`
- Delete: `packages/communication-layer/src/templates/plugins-json.template`

**Step 1: Remove legacy template files**

```bash
rm packages/communication-layer/src/templates/*.template
```

**Step 2: Update navigator-structure.md**

Edit `packages/communication-layer/src/protocols/navigator-structure.md`:

Old:
```markdown
See `templates/claude-md.template` for the canonical template.
```

New:
```markdown
See `templates/generators/claude-md.ts` for the canonical template generator.
```

**Step 3: Build communication-layer**

```bash
cd packages/communication-layer && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A packages/communication-layer/
git commit -m "chore(comms): remove legacy template files (replaced by generators)"
```

---

## Phase 4: Testing and Validation

### Task 11: Integration Testing

**Step 1: Test full navigator creation workflow**

```bash
cd /tmp
rm -rf test-nav-final
autonav init test-nav-final
```

When prompted, provide:
- Name: test-nav-final
- Description: Test navigator for refactor validation
- Scope: Testing template refactor
- Audience: Developers

Expected:
- Navigator created successfully
- CLAUDE.md has grounding rules, response format, navigator authority
- config.json has correct structure
- Skills created in .autonav/skills/
- Skills symlinked to ~/.claude/skills/

**Step 2: Verify skill content has RFC-2119**

```bash
cat /tmp/test-nav-final/.autonav/skills/ask-test-nav-final/SKILL.md | grep "MUST"
```

Expected: Multiple matches for "MUST", "MUST NOT", "MAY"

**Step 3: Test querying**

```bash
echo "# Test\nThis is a test document" > /tmp/test-nav-final/knowledge/test.md
autonav query /tmp/test-nav-final "What is in the test document?"
```

Expected: Returns answer citing test.md

**Step 4: Test mend**

```bash
autonav mend /tmp/test-nav-final
```

Expected: All health checks pass

**Step 5: Clean up test navigator**

```bash
rm -rf /tmp/test-nav-final
autonav uninstall /tmp/test-nav-final 2>/dev/null || true
```

**Step 6: Commit test validation**

```bash
git add -A
git commit -m "test: validate full navigator creation workflow"
```

---

## Phase 5: Version Migration (Optional - Deferred)

**Note:** Migration for existing navigators can be created in a follow-up PR. The refactor is backward compatible - existing navigators work with the new code, they just don't have RFC-2119 guidance until migrated.

Future migration v1.4.0 would:
1. Regenerate ask/update skills with RFC-2119 requirements
2. Update CLAUDE.md with new partials
3. Bump config.json version to 1.4.0

---

## Final Steps

### Task 12: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md` (if exists)

**Step 1: Update README if needed**

Check if README mentions templates or skills - update references to point to communication-layer.

**Step 2: Commit docs**

```bash
git add README.md docs/
git commit -m "docs: update references to template location"
```

### Task 13: Final Build and Validation

**Step 1: Clean build everything**

```bash
npm run build
```

Expected: All packages build successfully

**Step 2: Run tests if available**

```bash
npm test
```

Expected: All tests pass

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and validation"
```

---

## Summary of Changes

**Communication-Layer:**
- ✅ Added `templates/partials/` with GROUNDING_RULES, RESPONSE_FORMAT, etc.
- ✅ Added `templates/generators/` with template composition functions
- ✅ Added `skills/` module with all skill management logic
- ✅ Deleted legacy `.template` files
- ✅ Exported all new functions from main index

**Autonav:**
- ✅ Updated nav-init to use communication-layer generators
- ✅ Updated nav-mend to use communication-layer skills
- ✅ Updated nav-install/uninstall to use communication-layer skills
- ✅ Deleted `src/templates/` directory
- ✅ Deleted `src/skill-generator/` directory
- ✅ Removed template exports from index

**Skills:**
- ✅ Added RFC-2119 requirements (MUST/MUST NOT/MAY)
- ✅ Explicit warnings against changing directories
- ✅ Absolute path requirements

**Result:**
- Single source of truth in communication-layer
- No template duplication
- Clear package boundaries
- Skills prevent directory changes
- Backward compatible (existing navigators still work)
