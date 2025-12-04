/**
 * Interview prompts and tool definitions for interactive nav init
 */

import type { AnalysisResult } from "../repo-analyzer/index.js";

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

## Philosophy
Navs are "self-organizing notebooks that talk back" - they edit their own knowledge files, learn from conversations, and maintain their own context. Help the user think through how they want this self-organization to work.

## Guidelines
- Ask ONE question at a time
- Be conversational and helpful
- Ask follow-up questions when answers are vague
- After gathering enough information (usually 4-6 exchanges), output the navigator configuration

## When Creating the Navigator
After gathering enough information, output a JSON configuration block wrapped in \`\`\`json and \`\`\` markers. The JSON must include:

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

The claudeMd field should be a complete, personalized CLAUDE.md file based on what you learned, including:
- Clear purpose statement
- Grounding rules (always cite, never invent, acknowledge uncertainty)
- Domain-specific scope definition
- Knowledge organization guidance
- Response format expectations
- Self-organization rules based on their autonomy preference

IMPORTANT: Only output the JSON configuration when you have gathered enough information. Before that, just ask questions conversationally.`;

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
 */
export function parseNavigatorConfig(text: string): NavigatorConfig | null {
  // Look for JSON code block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch || !jsonMatch[1]) {
    return null;
  }

  try {
    const config = JSON.parse(jsonMatch[1].trim()) as NavigatorConfig;

    // Validate required fields
    if (!config.purpose || !config.scope || !config.claudeMd) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}
