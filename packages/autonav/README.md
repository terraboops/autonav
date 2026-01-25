# @autonav/core

CLI and SDK adapter for knowledge navigators.

## Install

```bash
npm install -g @autonav/core
```

## CLI

```bash
# Create a navigator
autonav init my-docs

# Query it
autonav query my-docs "How do I deploy?"

# Interactive chat mode
autonav chat my-docs
```

## Knowledge Packs

Knowledge packs are starter templates with pre-built documentation and configuration for specific domains.

```bash
# Install from a pack server
autonav init my-nav --pack platform-engineering

# Install from GitHub (full URL)
autonav init my-nav --pack https://github.com/owner/repo/tree/main/packs/my-pack

# Install from GitHub (shorthand)
autonav init my-nav --pack github:owner/repo/packs/my-pack

# Install from GitHub via SSH (uses your SSH keys)
autonav init my-nav --pack git@github.com:owner/repo/packs/my-pack

# Install specific version
autonav init my-nav --pack github:owner/repo/packs/my-pack@v1.0.0

# Install from local file
autonav init my-nav --pack-file ./my-pack.tar.gz
```

A knowledge pack must contain:
- `metadata.json` - Pack name and version
- `system-configuration.md` and/or `knowledge/` directory

**Note:** Currently, navigators support one knowledge pack. Multiple packs may be supported in a future release.

## Multi-Provider Support

Autonav supports multiple LLM providers:

```bash
# Use Claude (default)
autonav query ./my-nav "How do I deploy?"

# Use OpenCode (supports OpenAI, Anthropic, Ollama, etc.)
autonav query ./my-nav "How do I deploy?" --provider opencode

# Set default provider via environment
export AUTONAV_PROVIDER=opencode
export AUTONAV_MODEL=openai:gpt-4o
```

**Supported providers:**
- `claude` - Claude Code SDK (default, with streaming support)
- `opencode` - OpenCode CLI (requires `opencode` to be installed)

## Programmatic use

```typescript
import { createAdapter, ClaudeAdapter, OpenCodeAdapter } from "@autonav/core";

// Use factory (respects AUTONAV_PROVIDER env var)
const adapter = createAdapter();

// Or explicitly choose a provider
const claudeAdapter = new ClaudeAdapter();
const openCodeAdapter = new OpenCodeAdapter({ model: "openai:gpt-4o" });

const nav = await adapter.loadNavigator("./my-docs");
const response = await adapter.query(nav, "How do I deploy?");

console.log(response.answer);
console.log(response.sources);
```

## Navigator structure

```
my-docs/
├── config.json       # Name, version, settings
├── CLAUDE.md         # System prompt
├── knowledge-base/   # Your documentation
└── .claude/
    └── plugins.json  # Plugin configuration
```

## Response format

```json
{
  "query": "How do I deploy?",
  "answer": "Run kubectl apply -f prod.yaml",
  "sources": [
    {
      "filePath": "deployment.md",
      "excerpt": "kubectl apply -f prod.yaml"
    }
  ],
  "confidence": "high"
}
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude provider |
| `AUTONAV_PROVIDER` | Default LLM provider (`claude` or `opencode`) |
| `AUTONAV_MODEL` | Default model to use (provider-specific format) |

For OpenCode, configure your provider API keys using `opencode config`.

### Optional - LangSmith Tracing

Autonav supports optional [LangSmith](https://www.langchain.com/langsmith) tracing to monitor and debug Claude Agent SDK calls.

To enable LangSmith tracing:

1. Install the langsmith package:
   ```bash
   npm install langsmith
   ```

2. Set environment variables:
   ```bash
   export LANGSMITH_TRACING="true"
   export LANGSMITH_API_KEY="your-api-key"
   export LANGSMITH_PROJECT="your-project-name"  # Optional
   ```

3. Run autonav commands as normal:
   ```bash
   autonav query my-docs "How do I deploy?"
   ```

All queries will be traced to your LangSmith project, capturing:
- Full conversation history
- Tool calls and responses
- Model parameters
- Response validation

**Note:** LangSmith is completely optional. Autonav works normally without it.

## FAQ

**Why would I use this instead of just using Claude Code directly?**

You should keep using Claude Code! Autonav is designed to *augment* Claude Code, not replace it.

The recommended workflow is:
1. Create a navigator with `autonav init`
2. Work with it using Claude Code (`cd my-nav && claude`)
3. Use `autonav query` when you need programmatic access

Autonav is **batteries-included for navigators** - it standardizes the concept so navs are portable and integratable:
- **Portable**: Your nav is just a directory - run it anywhere Claude Code runs, or via the SDK on servers and CI/CD pipelines
- **Shareable**: Knowledge packs let you share curated context with others
- **Programmable**: `autonav query` gives consistent JSON output for automation
- **Batteries-included**: Plugins, validation, and scaffolding designed specifically for knowledge navigators

Claude Code is general-purpose and extensible too, but Autonav gives you the nav-specific tooling out of the box.
