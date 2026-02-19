/**
 * Interview prompts and tool definitions for interactive nav init
 */

import type { AnalysisResult } from "../repo-analyzer/index.js";
import { describeConfigSchema } from "@autonav/communication-layer";

/**
 * Context for pack-based interviews
 */
export interface PackContext {
  packName: string;
  packVersion: string;
  initGuide?: string; // Content of INIT.md from the pack
}

/**
 * Base system prompt for the nav creation interview
 */
const BASE_INTERVIEW_PROMPT = `You are helping create a new Autonav navigator - a self-organizing knowledge assistant.

## Your Role
Guide the user through understanding their needs so you can create a well-configured navigator. Ask questions naturally, one at a time. Listen carefully and ask follow-up questions when needed.

## Key Topics to Explore

1. **Purpose**: What is this navigator for? What problems will it solve?
2. **Scope**: What topics should it know about? What's explicitly out of scope?
3. **Knowledge Structure**: How should knowledge be organized? (by topic, project, chronologically, as a journal, etc.)
4. **Knowledge Sources**: What documentation will be added? How should new knowledge be captured over time?
5. **Audience**: Who will use this? How should it communicate? (formal, casual, technical depth)
6. **Autonomy**: How autonomous should it be? Should it create/modify files freely, or ask first?
7. **Tools & CLI integrations**: Does the navigator need access to any CLI tools? (e.g., linear, gh, kubectl, npm).

## Philosophy
Navs are "self-organizing notebooks that talk back" - they edit their own knowledge files, learn from conversations, and maintain their own context. Help the user think through how they want this self-organization to work.

## Interview Flow

### Phase 1: Information Gathering (Exchanges 1-4)
- Ask ONE question at a time
- Be conversational and helpful
- Ask follow-up questions when answers are vague
- Focus on understanding their needs

### Phase 2: Signal Readiness (After 4-6 exchanges)
Once you have gathered enough information to create a basic navigator configuration, signal that you're ready by saying something like:

"I have enough information to create your navigator. Type 'done' when you're ready, or we can continue refining if you have more details to share."

**IMPORTANT**: After signaling readiness, DO NOT generate the JSON configuration yet. Wait for the user to explicitly type 'done', 'finish', 'ready', or similar. Continue answering any additional questions they have.

### Phase 3: Configuration Generation (User types 'done')
Only generate the configuration when the user explicitly indicates they're ready.

## When Creating the Navigator
After the user types 'done' (or similar), output a JSON configuration block wrapped in \`\`\`json and \`\`\` markers.

**CRITICAL**: Output ONLY the JSON block and NOTHING ELSE. Do NOT add explanatory text before or after the JSON. The JSON itself IS your final response.

The JSON must include:

\`\`\`json
{
  "purpose": "One-sentence description of what this navigator is for",
  "scope": "Topics in scope and explicitly out of scope",
  "knowledgeStructure": "How knowledge should be organized (by topic, chronologically, by project, etc.)",
  "audience": "Who uses this navigator and how it should communicate",
  "autonomy": "Autonomy level - can it create files freely or should it ask first",
  "claudeMd": "The complete CLAUDE.md content as a string with proper newlines (\\n)",
  "suggestedDirectories": ["optional", "array", "of", "subdirectories"]
}
\`\`\`

**IMPORTANT**: After outputting the JSON block, your job is complete. Do NOT add any commentary, instructions, or ask for further confirmation. The system will automatically use this configuration to create the navigator.

## Navigator config.json Schema Reference

The navigator's config.json supports the following fields. Use this to understand what configuration options are available when creating the navigator:

${describeConfigSchema()}

Note: The interview JSON output (purpose, scope, claudeMd, etc.) is a simplified interview format. The system uses it to generate the full config.json above. You don't need to output every config.json field — just the interview fields listed above. But understanding the full schema helps you ask better questions about sandbox settings, related navigators, working directories, etc.

The claudeMd field should be a complete, personalized CLAUDE.md file based on what you learned, including:
- Clear purpose statement
- Grounding rules (always cite, never invent, acknowledge uncertainty)
- Domain-specific scope definition
- Knowledge organization guidance
- Response format expectations (MUST use submit_answer tool, NOT plain text/JSON)
- Self-organization rules based on their autonomy preference

**CRITICAL**: The CLAUDE.md MUST include a "Response Format" section instructing the navigator to use the submit_answer tool for all responses. Never instruct navigators to output raw JSON - they must always use the submit_answer tool with answer, sources, and confidence parameters.

## Critical Rules
1. Ask questions conversationally until you have enough information (4-6 exchanges typically)
2. Signal readiness explicitly but DO NOT auto-generate configuration
3. Wait for user's explicit 'done' command before generating JSON
4. Never simulate user responses or create multi-turn conversations alone`;

/**
 * Get the interview system prompt, optionally customized for a pack or analysis
 */
export function getInterviewSystemPrompt(
  packContext?: PackContext,
  analysisContext?: AnalysisResult
): string {
  let prompt = BASE_INTERVIEW_PROMPT;

  // Add pack context section if provided
  if (packContext) {
    let packSection = `
## Knowledge Pack Context

This navigator is being created with the **${packContext.packName}** knowledge pack (v${packContext.packVersion}).
The pack provides pre-built knowledge and configuration for a specific domain.
`;

    if (packContext.initGuide) {
      packSection += `
## Pack Interview Guide (from INIT.md)

The pack author has provided the following guidance for this interview:

---
${packContext.initGuide}
---

Use this guidance to inform your questions and the navigator configuration. The pack's INIT.md takes precedence over the default topics - focus on what the pack author wants to capture during setup.
`;
    } else {
      packSection += `
Since this pack provides domain knowledge, you can focus more on:
- How the user will use this specific domain knowledge
- Their experience level with the domain
- Specific customizations or preferences
- How autonomous the navigator should be with the pack's knowledge
`;
    }

    prompt += packSection;
  }

  // Add analysis context section if provided
  if (analysisContext) {
    const analysisSection = `

## Analysis Context

This navigator is being created from an existing repository that has been analyzed:

- **Purpose**: ${analysisContext.purpose}
- **Scope**: ${analysisContext.scope}
- **Audience**: ${analysisContext.audience}
- **Confidence**: ${(analysisContext.confidence * 100).toFixed(0)}%

Your role is to help the user refine this analysis. Ask clarifying questions to:
1. Confirm if the inferred purpose is accurate
2. Adjust the scope if needed
3. Refine audience and communication style
4. Explore knowledge organization preferences

Start by presenting the analysis summary and asking if they'd like to refine any aspect.
`;

    prompt += analysisSection;
  }

  return prompt;
}

/**
 * Legacy export for backwards compatibility
 */
export const INTERVIEW_SYSTEM_PROMPT = BASE_INTERVIEW_PROMPT;

/**
 * Type for the navigator configuration from the interview
 */
export interface NavigatorConfig {
  purpose: string;
  scope: string;
  knowledgeStructure?: string;
  audience?: string;
  autonomy?: string;
  claudeMd: string;
  suggestedDirectories?: string[];
}

/**
 * Parse a JSON configuration from the assistant's response
 *
 * This function extracts JSON from markdown code blocks and validates it.
 * It handles cases where the agent includes additional text before or after the JSON.
 */
export function parseNavigatorConfig(text: string): NavigatorConfig | null {
  // Look for JSON code block - use non-greedy match to get first occurrence
  // Pattern matches: ```json ... ``` (with optional whitespace)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch || !jsonMatch[1]) {
    return null;
  }

  try {
    const jsonText = jsonMatch[1].trim();
    const config = JSON.parse(jsonText) as NavigatorConfig;

    // Validate required fields
    if (!config.purpose || !config.scope || !config.claudeMd) {
      // Log validation failure for debugging
      if (process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1") {
        console.error("[DEBUG] Config validation failed:", {
          hasPurpose: !!config.purpose,
          hasScope: !!config.scope,
          hasClaudeMd: !!config.claudeMd,
        });
      }
      return null;
    }

    return config;
  } catch (err) {
    // Log parse error for debugging
    if (process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1") {
      console.error("[DEBUG] JSON parse error:", err);
    }
    return null;
  }
}
