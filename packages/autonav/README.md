# @platform-ai/autonav

CLI tools and Claude SDK Adapter for Platform AI navigators.

## Overview

Autonav provides everything you need to build and query knowledge navigators:

- **`nav-init`**: Scaffold a new navigator in seconds
- **`nav-query`**: Query navigators from the command line
- **`ClaudeAdapter`**: SDK adapter for programmatic use

## Quick Start

### 1. Create a Navigator

```bash
npx @platform-ai/autonav init my-docs
cd my-docs
```

This creates:
```
my-docs/
├── config.json          # Navigator configuration
├── CLAUDE.md           # System prompt and grounding rules
├── knowledge-base/     # Add your docs here
└── README.md           # Usage instructions
```

### 2. Add Documentation

```bash
cp -r ~/my-docs/* knowledge-base/
```

Add any markdown, text, or documentation files. The navigator will search them all.

### 3. Query the Navigator

```bash
export ANTHROPIC_API_KEY=your-api-key
npx @platform-ai/autonav query . "How do I deploy to production?"
```

Get a structured JSON response with citations:

```json
{
  "protocolVersion": "1.0.0",
  "query": "How do I deploy to production?",
  "answer": "To deploy to production, follow these steps...",
  "sources": [
    {
      "filePath": "deployment/production.md",
      "excerpt": "Run kubectl apply -f prod.yaml",
      "section": "Deployment"
    }
  ],
  "confidence": 0.95
}
```

## Installation

### As a CLI tool

```bash
npm install -g @platform-ai/autonav
```

Then use directly:
```bash
nav-init my-navigator
nav-query ./my-navigator "Your question"
```

### As a library

```bash
npm install @platform-ai/autonav
```

Then use programmatically:
```typescript
import { ClaudeAdapter } from "@platform-ai/autonav";

const adapter = new ClaudeAdapter(apiKey);
const navigator = adapter.loadNavigator("./my-navigator");
const response = await adapter.query(navigator, "How do I deploy?");
```

## CLI Commands

### `nav-init`

Create a new navigator.

**Usage**:
```bash
nav-init <navigator-name> [description]
```

**Examples**:
```bash
nav-init platform-docs
nav-init aws-navigator "AWS infrastructure documentation"
```

**What it creates**:
- `config.json` - Navigator configuration
- `CLAUDE.md` - System prompt with grounding rules
- `knowledge-base/` - Directory for documentation
- `.gitignore` - Standard gitignore
- `README.md` - Usage instructions

### `nav-query`

Query a navigator.

**Usage**:
```bash
nav-query <navigator-path> <question>
```

**Examples**:
```bash
nav-query ./platform-docs "How do I configure SSL?"
nav-query . "What are the deployment steps?"
```

**Environment**:
- `ANTHROPIC_API_KEY` (required) - Your Anthropic API key

**Output**:
- JSON response on stdout (for piping/parsing)
- Progress messages on stderr (for human reading)

## Programmatic API

### ClaudeAdapter

The main class for loading and querying navigators.

```typescript
import { ClaudeAdapter } from "@platform-ai/autonav";

const adapter = new ClaudeAdapter(apiKey);
```

#### Methods

##### `loadNavigator(path: string): LoadedNavigator`

Load a navigator from a directory.

```typescript
const navigator = adapter.loadNavigator("./my-navigator");

console.log(navigator.config.name);
console.log(navigator.knowledgeBasePath);
```

**Throws**:
- If `config.json` is missing or invalid
- If `CLAUDE.md` is missing
- If knowledge base directory doesn't exist

##### `async query(navigator: LoadedNavigator, question: string): Promise<NavigatorResponse>`

Query a navigator.

```typescript
const response = await adapter.query(navigator, "How do I deploy?");

console.log(response.answer);
console.log(response.sources);
console.log(response.confidence);
```

**Returns**: `NavigatorResponse` from `@platform-ai/communication-layer`

**Throws**:
- If Claude API call fails
- If response parsing fails
- If validation detects errors (hallucinations, missing sources)

##### `parseResponse(rawResponse: string, query: string): NavigatorResponse`

Parse Claude's text response into structured JSON.

```typescript
const response = adapter.parseResponse(rawText, "How do I deploy?");
```

##### `validate(response: NavigatorResponse, knowledgeBasePath: string): ValidationResult`

Validate a response for hallucinations and source accuracy.

```typescript
const validation = adapter.validate(response, "./knowledge-base");

if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}
```

## Configuration

### config.json

Navigator configuration file:

```json
{
  "version": "1.0.0",
  "name": "my-navigator",
  "description": "My documentation navigator",
  "communicationLayerVersion": "^1.0.0",
  "sdkAdapterVersion": "^1.0.0",
  "knowledgeBasePath": "knowledge-base",
  "instructionsPath": "CLAUDE.md",
  "createdAt": "2025-11-11T00:00:00Z",
  "updatedAt": "2025-11-11T00:00:00Z"
}
```

### CLAUDE.md

System prompt that defines how the navigator behaves.

**Key sections**:
- **Grounding Rules**: Prevent hallucinations, enforce citations
- **Response Format**: JSON structure for responses
- **Confidence Scoring**: Guidelines for self-assessment

You can customize this file to:
- Add domain-specific terminology
- Include answer formatting rules
- Specify citation style preferences

## Best Practices

### Knowledge Base Organization

```
knowledge-base/
├── getting-started/
│   └── quickstart.md
├── deployment/
│   ├── aws.md
│   ├── kubernetes.md
│   └── troubleshooting.md
├── api/
│   └── endpoints.md
└── README.md
```

**Tips**:
- Use descriptive directory names
- Keep files focused on one topic
- Include section headings for better citations
- Update docs regularly

### Writing Good Documentation

1. **Clear headings**: Use markdown sections (`##`, `###`)
2. **Code examples**: Include working examples
3. **Explicit commands**: Show exact commands, not descriptions
4. **Update dates**: Include "last updated" dates
5. **Links**: Reference other docs when appropriate

### Querying Tips

**Good questions**:
- "How do I deploy to production?"
- "What are the SSL configuration options?"
- "Show me an example of configuring the database"

**Less effective questions**:
- "Tell me everything about deployment" (too broad)
- "What's the best way?" (subjective)
- "Can you write code for me?" (navigators surface docs, don't generate code)

## Validation & Hallucination Detection

Autonav automatically validates responses:

1. **Source verification**: Cited files must exist
2. **Pattern detection**: Checks for made-up ARNs, file paths
3. **Confidence scoring**: Low confidence triggers warnings
4. **Missing citations**: Answers without sources are flagged

If validation fails, the query command will:
- Show error details
- Exit with non-zero code
- Suggest fixes

## Environment Variables

- `ANTHROPIC_API_KEY` (required) - Your Anthropic API key
  - Get one at: https://console.anthropic.com/

## Examples

### Piping output

```bash
# Get just the answer
nav-query ./docs "How do I deploy?" | jq -r '.answer'

# Get sources
nav-query ./docs "How do I deploy?" | jq -r '.sources[].filePath'

# Check confidence
nav-query ./docs "How do I deploy?" | jq -r '.confidence'
```

### Scripting

```bash
#!/bin/bash
# query-and-log.sh

QUESTION="$1"
OUTPUT_FILE="query-log.jsonl"

nav-query ./my-navigator "$QUESTION" >> "$OUTPUT_FILE"
echo "✓ Query logged to $OUTPUT_FILE"
```

### Programmatic use

```typescript
import { ClaudeAdapter } from "@platform-ai/autonav";
import { writeFileSync } from "fs";

const adapter = new ClaudeAdapter();
const navigator = adapter.loadNavigator("./my-navigator");

const questions = [
  "How do I deploy?",
  "What are the SSL options?",
  "How do I troubleshoot errors?",
];

for (const question of questions) {
  const response = await adapter.query(navigator, question);

  writeFileSync(
    `answers/${question.replace(/[^a-z0-9]/gi, "_")}.json`,
    JSON.stringify(response, null, 2)
  );
}
```

## Troubleshooting

### "config.json not found"

Make sure you're in the navigator directory or pass the correct path:
```bash
nav-query ./path/to/navigator "Your question"
```

### "ANTHROPIC_API_KEY is required"

Set your API key:
```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

Or pass it inline:
```bash
ANTHROPIC_API_KEY=your-key nav-query ./navigator "Question"
```

### "Validation failed"

The navigator cited files that don't exist or showed hallucination patterns:
- Check that knowledge-base contains the right files
- Verify file paths are correct
- Consider adding more documentation on the topic

### Low confidence scores

- Add more detailed documentation
- Ensure docs cover the topic thoroughly
- Check that docs are organized clearly

## Architecture

Autonav bridges Claude API to the Communication Layer protocol:

```
┌─────────────────┐
│   CLI Commands  │  nav-init, nav-query
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ClaudeAdapter   │  Load, query, parse, validate
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Claude API    │  LLM execution
└─────────────────┘
```

See [@platform-ai/communication-layer](../communication-layer) for protocol details.

## Contributing

This package is part of the Platform AI monorepo.

To develop:
```bash
cd packages/autonav
npm run dev        # Watch mode
npm run build      # Build
npm test           # Run tests
```

## License

TBD

## Links

- [Communication Layer](../communication-layer)
- [Platform AI Docs](../../docs)
- [Anthropic Claude](https://www.anthropic.com/claude)
