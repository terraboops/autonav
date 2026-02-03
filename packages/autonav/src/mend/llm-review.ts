/**
 * LLM-powered quality review of CLAUDE.md files
 * Uses Claude Opus to check for issues that static analysis can't catch
 */

import Anthropic from "@anthropic-ai/sdk";

export interface QualityIssue {
  severity: "error" | "warning" | "suggestion";
  category: string;
  description: string;
  location?: string; // Section or line reference
  suggestion?: string;
}

export interface QualityReviewResult {
  passed: boolean;
  issues: QualityIssue[];
  summary: string;
}

const REVIEW_PROMPT = `You are reviewing a CLAUDE.md file for a knowledge navigator. Analyze it for quality issues.

Check for:
1. **Contradictions**: Instructions that conflict with each other
2. **Prompt Engineering Best Practices** (per Anthropic guidelines):
   - Clear role definition
   - Specific, actionable instructions
   - No vague or ambiguous language
   - Proper use of formatting (headers, lists)
   - Instructions are ordered by importance
3. **Completeness**: Missing essential sections (grounding rules, response format, etc.)
4. **Hallucination Risks**: Instructions that might encourage making things up
5. **Consistency**: Tone, terminology, and style are consistent throughout

CLAUDE.md content:
\`\`\`markdown
{content}
\`\`\`

Respond with a JSON object:
{
  "passed": boolean,
  "issues": [
    {
      "severity": "error" | "warning" | "suggestion",
      "category": "contradiction" | "best-practice" | "completeness" | "hallucination-risk" | "consistency",
      "description": "what's wrong",
      "location": "section or context where issue occurs",
      "suggestion": "how to fix it"
    }
  ],
  "summary": "1-2 sentence overall assessment"
}

Only include actual issues found. An empty issues array means the file passes review.`;

export async function reviewClaudeMd(claudeMdContent: string): Promise<QualityReviewResult> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: REVIEW_PROMPT.replace("{content}", claudeMdContent)
    }],
  });

  // Extract JSON from response
  const firstBlock = response.content[0];
  const text = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      passed: false,
      issues: [{
        severity: "error",
        category: "review-failed",
        description: "Failed to parse LLM review response",
      }],
      summary: "Review could not be completed",
    };
  }

  try {
    return JSON.parse(jsonMatch[0]) as QualityReviewResult;
  } catch {
    return {
      passed: false,
      issues: [{
        severity: "error",
        category: "review-failed",
        description: "Failed to parse LLM review response as JSON",
      }],
      summary: "Review could not be completed",
    };
  }
}
