import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ScanResult } from "../repo-scanner/index.js";

/**
 * Repository Analyzer
 *
 * Uses Claude to analyze scan results and infer navigator configuration.
 */

// Model to use for analysis
const ANALYSIS_MODEL = "claude-sonnet-4-5";

export interface AnalysisResult {
  purpose: string;
  scope: string;
  audience: string;
  suggestedKnowledgePaths: string[];
  confidence: number;
}

/**
 * Build the analysis prompt from scan results
 */
function buildAnalysisPrompt(scanResult: ScanResult): string {
  const { files, directoryStructure, projectMetadata, stats } = scanResult;

  // Build file content section
  const fileContents = files
    .filter((f) => f.content)
    .map((f) => `### ${f.relativePath}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  return `You are analyzing a repository to create a knowledge navigator configuration.

## Repository Structure

\`\`\`
${directoryStructure}
\`\`\`

## Project Metadata

${projectMetadata.name ? `- **Name**: ${projectMetadata.name}` : ""}
${projectMetadata.description ? `- **Description**: ${projectMetadata.description}` : ""}
${projectMetadata.language ? `- **Language**: ${projectMetadata.language}` : ""}
${projectMetadata.keywords?.length ? `- **Keywords**: ${projectMetadata.keywords.join(", ")}` : ""}
${projectMetadata.dependencies?.length ? `- **Dependencies**: ${projectMetadata.dependencies.slice(0, 10).join(", ")}${projectMetadata.dependencies.length > 10 ? "..." : ""}` : ""}

## Scan Statistics

- Total files: ${stats.totalFiles}
- Files scanned: ${stats.scannedFiles}
- Strategy used: ${stats.strategy}

## File Contents

${fileContents}

---

Based on this repository analysis, provide a navigator configuration. Respond with ONLY a JSON object in this exact format:

\`\`\`json
{
  "purpose": "A one-sentence description of what this repository/project does",
  "scope": "Topics this navigator should cover (in-scope) and what it should NOT cover (out-of-scope)",
  "audience": "Who would use this navigator and what communication style is appropriate",
  "suggestedKnowledgePaths": ["array", "of", "paths", "to", "use", "as", "knowledge"],
  "confidence": 0.85
}
\`\`\`

Guidelines:
- purpose: Be specific and accurate based on the actual code/docs
- scope: List specific topics, not vague categories
- audience: Consider the project type (library, application, internal tool, etc.)
- suggestedKnowledgePaths: Include paths that contain useful documentation (README.md, docs/, etc.)
- confidence: 0.0-1.0, how confident you are in this analysis (lower if repo has minimal docs)

Respond ONLY with the JSON block, no other text.`;
}

/**
 * Parse the analysis response from Claude
 */
function parseAnalysisResponse(response: string): AnalysisResult | null {
  // Extract JSON from response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch?.[1] ?? response;

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Validate required fields
    if (
      typeof parsed.purpose !== "string" ||
      typeof parsed.scope !== "string" ||
      typeof parsed.audience !== "string" ||
      !Array.isArray(parsed.suggestedKnowledgePaths) ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      purpose: parsed.purpose,
      scope: parsed.scope,
      audience: parsed.audience,
      suggestedKnowledgePaths: parsed.suggestedKnowledgePaths,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

/**
 * Analyze a scanned repository using Claude
 */
export async function analyzeRepository(
  scanResult: ScanResult
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(scanResult);

  try {
    const queryInstance = query({
      prompt,
      options: {
        model: ANALYSIS_MODEL,
        permissionMode: "bypassPermissions",
      },
    });

    let responseText = "";

    for await (const message of queryInstance) {
      if (message.type === "assistant") {
        const content = message.message.content;
        const textBlocks = content.filter(
          (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
        );
        responseText = textBlocks.map((b) => b.text).join("\n");
      }
    }

    const result = parseAnalysisResponse(responseText);

    if (!result) {
      // Return a default with low confidence if parsing failed
      return {
        purpose: scanResult.projectMetadata.description || "A software project",
        scope: "This repository's code and documentation",
        audience: "Developers working with this codebase",
        suggestedKnowledgePaths: scanResult.files
          .filter((f) => f.type === "readme" || f.type === "docs")
          .map((f) => f.relativePath)
          .slice(0, 5),
        confidence: 0.3,
      };
    }

    return result;
  } catch (error) {
    // Return a fallback on error
    return {
      purpose: scanResult.projectMetadata.description || scanResult.projectMetadata.name || "A software project",
      scope: "This repository's code and documentation",
      audience: "Developers working with this codebase",
      suggestedKnowledgePaths: scanResult.files
        .filter((f) => f.type === "readme" || f.type === "docs")
        .map((f) => f.relativePath)
        .slice(0, 5),
      confidence: 0.2,
    };
  }
}
