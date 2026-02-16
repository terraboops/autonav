<div align="center">

```
    ___   __  ____________  _   _____    _    __
   /   | / / / /_  __/ __ \/ | / /   |  | |  / /
  / /| |/ / / / / / / / / /  |/ / /| |  | | / /
 / ___ / /_/ / / / / /_/ / /|  / ___ |  | |/ /
/_/  |_\____/ /_/  \____/_/ |_/_/  |_|  |___/
```

  <h3>Navigators for the AI age</h3>

  [![npm version](https://img.shields.io/npm/v/@autonav/core)](https://www.npmjs.com/package/@autonav/core)
  [![downloads](https://img.shields.io/npm/dm/@autonav/core)](https://www.npmjs.com/package/@autonav/core)
  [![license](https://img.shields.io/npm/l/@autonav/core)](./LICENSE)
  [![CI](https://img.shields.io/github/actions/workflow/status/terraboops/platform-ai/ci.yml?branch=main)](https://github.com/terraboops/platform-ai/actions)
  [![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## Table of Contents
- [The Problem](#the-problem)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Knowledge Packs](#knowledge-packs)
- [Plugins](#plugins)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## The Problem

LLMs are great at answering questions, but they hallucinate.
Feed them your docs and they still make things up.

Autonav reduces this with **grounded responses**:
- Answers cite specific source files
- Sources get validated against the knowledge base
- Confidence scores are explicit
- Makes hallucinations easier to catch

---

## Quick Start

```bash
# Install
npm install -g @autonav/core

# Create a navigator
autonav init my-docs

# Add your docs
cp -r ~/docs/* my-docs/knowledge/

# Query it
autonav query my-docs "How do I deploy?"
```

---

## How It Works

1. **You create a navigator** - A directory with your docs and a CLAUDE.md
2. **Claude Code reads it** - CLAUDE.md becomes the system prompt
3. **Questions get grounded** - Every answer cites specific files
4. **Hallucinations get caught** - Validation checks that sources exist

Two ways to use it:
- **Claude Code TUI**: `cd my-docs && claude` (interactive)
- **CLI queries**: `autonav query my-docs "question"` (scripting)

---

## Installation

### npm (recommended)
```bash
npm install -g @autonav/core
```

### From source
```bash
git clone https://github.com/terraboops/platform-ai
cd platform-ai
npm install && npm run build
npm link -w packages/autonav
```

---

## Usage

### Interactive Mode (Claude Code)
```bash
cd my-navigator
claude
# Have a conversation grounded in your docs
```

### Query Mode (Scripting)
```bash
autonav query ./my-navigator "How do I configure SSL?"
```

### Update Navigator
```bash
autonav update ./my-navigator
# Update navigator to latest version
```

### With Knowledge Packs
```bash
# Start with pre-built docs
autonav init my-nav --pack platform-engineering

# Or install from GitHub
autonav init my-nav --pack github:user/repo

# Or from a local directory
autonav init my-nav --pack /path/to/pack
```

---

## Knowledge Packs

Starter packs for common domains - think of them as curated documentation collections that configure navigators for specific use cases.

**What's included:**
- Pre-written documentation and guides
- Configured CLAUDE.md system prompt
- Plugin configurations (Slack, GitHub, etc.)
- Ready-to-use knowledge base

**Available packs:**
- `platform-engineering` - DevOps, infrastructure, deployment workflows
- Community packs (create and share your own!)

**Creating your own pack:**
```
my-pack/
├── system-configuration.md   # Required - navigator configuration
├── knowledge/                # Your documentation
│   ├── deployment.md
│   └── troubleshooting.md
└── .claude/                  # Optional plugin configs
    └── plugins.json
```

[Learn more about the Knowledge Pack Protocol →](./docs/KNOWLEDGE_PACK_PROTOCOL.md)

---

## Plugins

Built-in integrations:

### Slack
Monitor channels, post messages, respond to threads:
```json
{
  "slack": {
    "enabled": true,
    "workspace": "my-workspace",
    "channels": ["platform-team", "alerts"],
    "threadNotifications": true,
    "summaryFrequency": "daily"
  }
}
```

### GitHub
Watch issues and PRs, auto-respond, create summaries:
```json
{
  "github": {
    "enabled": true,
    "repositories": ["org/repo"],
    "issueLabels": ["platform", "infrastructure"],
    "autoRespond": true
  }
}
```

### FileWatcher
React to file system changes:
```json
{
  "fileWatcher": {
    "enabled": true,
    "patterns": ["docs/**/*.md", "config/**/*.yaml"],
    "ignorePatterns": ["**/node_modules/**"]
  }
}
```

### Signal _(coming soon)_
Personal notifications and scheduled check-ins:
```json
{
  "signal": {
    "enabled": true,
    "phoneNumber": "+1234567890",
    "checkInSchedule": "daily",
    "checkInTime": "09:00"
  }
}
```

**Self-Configuration**: Navigators can modify their own plugin configs based on conversations. Ask your navigator to "check in with me tomorrow at 3pm" and it updates its own schedule.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│ Navigator Directory                         │
├─────────────────────────────────────────────┤
│ CLAUDE.md          → System prompt          │
│ config.json        → Navigator config       │
│ knowledge/         → Your documentation     │
│ .claude/           → Plugin configs         │
└─────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ Autonav CLI                                 │
├─────────────────────────────────────────────┤
│ init    → Create navigator                  │
│ query   → Ask questions                     │
│ update  → Update to new version             │
└─────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ Claude Code SDK                             │
├─────────────────────────────────────────────┤
│ • Agentic search (Grep, Read, Bash)        │
│ • Tool use and structured outputs           │
│ • Multi-turn conversations                  │
└─────────────────────────────────────────────┘
```

**Three Components:**
1. **Autonav Framework** - CLI, plugin system, configuration management
2. **Communication Layer** - Response schemas, validation, grounding rules
3. **Knowledge Packs** - HTTP-distributed community content

---

## Development

```bash
# Clone and install
git clone https://github.com/terraboops/platform-ai
cd platform-ai
npm install

# Build all packages
npm run build

# Run tests
npm test

# Type checking
npm run typecheck
```

### Debug Mode
```bash
AUTONAV_DEBUG=1 autonav query my-nav "question"
```

### Metrics Collection
```bash
AUTONAV_METRICS=1 autonav query my-nav "question"
```

### Project Structure
```
platform-ai/
├── packages/
│   ├── autonav/              # Main CLI and framework
│   └── communication-layer/  # Schemas and validation
├── packs/
│   └── platform-engineering/ # Example knowledge pack
├── docs/                     # Documentation
└── examples/                 # Example navigators
```

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

**Help wanted:**
- Creating knowledge packs for popular domains (Kubernetes, AWS, etc.)
- Documentation improvements
- Bug reports and feature requests

---

## Philosophy

**Stochastic Parrots as Feature**: LLMs don't create knowledge - they organize existing knowledge exceptionally well. Autonav embraces this by focusing on context management rather than fighting hallucinations.

**Navs as LLM Abstraction**: Just as containers are the abstraction for deploying software, navigators are the abstraction for interacting with LLMs. Self-contained, version-controlled, shareable.

**Community-Driven Knowledge**: Knowledge packs enable anyone to curate and share domain expertise without package coordination complexity. HTTP distribution means zero gatekeeping.

---

## License

Apache-2.0 © [Terra Tauri](https://terratauri.com)

---

## Learn More

| Resource | Description |
|----------|-------------|
| [The Navigator Pattern](https://terratauri.com/blog/navigator-pattern/) | Introduction to the navigator pattern and philosophy |
| [Knowledge Pack Protocol](docs/KNOWLEDGE_PACK_PROTOCOL.md) | Create and distribute your own knowledge packs |
| [Autonav CLI](packages/autonav/README.md) | CLI commands and NavigatorAdapter API |
| [Communication Layer](packages/communication-layer/README.md) | Response schemas and validation |
| [Navigator Structure](packages/communication-layer/src/protocols/navigator-structure.md) | What files make up a navigator |
| [CLAUDE.md Guide](./CLAUDE.md) | Full development guide and project context |
