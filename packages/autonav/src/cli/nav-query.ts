#!/usr/bin/env node

import * as path from "node:path";
import { ClaudeAdapter } from "../adapter/index.js";

/**
 * nav-query CLI command
 *
 * Query a navigator with a question and get a structured response
 *
 * Usage:
 *   nav-query <navigator-path> <question>
 */

function printUsage() {
  console.log(`
nav-query - Query a Platform AI navigator

Usage:
  nav-query <navigator-path> <question>

Arguments:
  navigator-path    Path to the navigator directory (required)
  question         Question to ask the navigator (required)

Environment Variables:
  ANTHROPIC_API_KEY    Your Anthropic API key (required)

Examples:
  nav-query ./platform-navigator "How do I deploy to production?"
  nav-query . "What are the SSL configuration options?"
  ANTHROPIC_API_KEY=sk-... nav-query ./docs-navigator "Explain the auth flow"

Output:
  The command outputs a JSON response with:
  - query: The question asked
  - answer: The detailed answer with citations
  - sources: Array of cited sources from the knowledge base
  - confidence: Confidence score (0-1)
  - protocolVersion: Communication layer version
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ Error: ANTHROPIC_API_KEY environment variable is required\n");
    console.error("Set it with:");
    console.error("  export ANTHROPIC_API_KEY=your-api-key\n");
    console.error("Or pass it inline:");
    console.error("  ANTHROPIC_API_KEY=your-api-key nav-query ...\n");
    process.exit(1);
  }

  // Parse arguments
  if (args.length < 2 || !args[0]) {
    console.error("❌ Error: Both navigator path and question are required\n");
    printUsage();
    process.exit(1);
  }

  const navigatorPath = path.resolve(process.cwd(), args[0]);
  const question = args.slice(1).join(" ");

  if (!question.trim()) {
    console.error("❌ Error: Question cannot be empty\n");
    printUsage();
    process.exit(1);
  }

  try {
    console.error("🔍 Loading navigator...");

    // Initialize adapter
    const adapter = new ClaudeAdapter();

    // Load navigator
    const navigator = adapter.loadNavigator(navigatorPath);
    console.error(`✓ Loaded: ${navigator.config.name}`);
    console.error(`✓ Knowledge base: ${navigator.knowledgeBasePath}\n`);

    // Query the navigator
    console.error(`❓ Question: "${question}"\n`);
    console.error("🤔 Querying Claude...\n");

    const response = await adapter.query(navigator, question);

    // Output the response as JSON to stdout
    console.log(JSON.stringify(response, null, 2));

    // Log summary to stderr
    console.error(`\n✅ Query completed successfully!`);
    console.error(`   Sources cited: ${response.sources.length}`);
    console.error(
      `   Confidence: ${response.confidence !== undefined ? (response.confidence * 100).toFixed(0) + "%" : "N/A"}\n`
    );

    // Show sources
    if (response.sources.length > 0) {
      console.error("📚 Sources:");
      for (const source of response.sources) {
        console.error(`   - ${source.filePath}`);
        if (source.lineNumbers) {
          console.error(`     (lines ${source.lineNumbers[0]}-${source.lineNumbers[1]})`);
        }
      }
      console.error("");
    }
  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

main();
