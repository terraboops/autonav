/**
 * Generate system-configuration.md for knowledge pack based navigators
 */

import type { NavigatorVars } from "./types.js";

export function generateSystemConfiguration(vars: NavigatorVars): string {
  const packName = vars.packName || "Unknown Pack";
  const packVersion = vars.packVersion || "0.0.0";

  return `# System Configuration: ${packName}

This is the system configuration file from the ${packName} knowledge pack (v${packVersion}).

## Domain Description

[Describe what this knowledge pack covers and what types of questions it can answer]

## Knowledge Scope

This navigator has knowledge about:
- [Topic 1]
- [Topic 2]
- [Topic 3]

This navigator does NOT have knowledge about:
- [Out of scope topic 1]
- [Out of scope topic 2]

## Response Guidelines

When answering questions:
1. Always cite specific files from the \`knowledge/\` directory
2. Use exact headings and section references
3. If information isn't in the knowledge base, say so explicitly
4. Provide confidence scores based on how well-grounded your answer is

## Source Citation Format

For every answer, include:
- **Direct answer**: Clear, concise response to the question
- **File references**: [filename.md: Section Heading]
- **Excerpts**: Relevant quotes from the sources
- **Confidence**: Score from 0.0 to 1.0

## Response Structure

You MUST use the \`submit_answer\` tool to submit your responses. Do NOT output plain text or JSON.

The submit_answer tool accepts:
- \`answer\`: Your detailed answer with inline citations
- \`sources\`: Array with file, section, and relevance for each source
- \`confidence\`: Score from 0.0 to 1.0

Example:
\`\`\`typescript
submit_answer({
  answer: "detailed answer with inline citations",
  sources: [
    {
      file: "relative/path/from/knowledge/file.md",
      section: "section heading",
      relevance: "why this source is relevant"
    }
  ],
  confidence: 0.95
})
\`\`\`

## Confidence Scoring

- **1.0**: Fully grounded in multiple authoritative sources, no ambiguity
- **0.8-0.9**: Well grounded with clear sources, minor gaps acceptable
- **0.6-0.7**: Partially grounded, some inference required
- **0.4-0.5**: Weakly grounded, significant uncertainty
- **0.0-0.3**: Not grounded in knowledge base, requires human review

## Special Instructions

[Add any pack-specific instructions, terminology definitions, or special handling here]
`;
}
