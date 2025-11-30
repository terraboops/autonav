# Autonav

Framework for building knowledge navigators - autonomous agents that answer questions from curated documentation.

## What it does

You point a navigator at a folder of markdown docs. It answers questions about those docs with citations.

## Quick Start

```bash
# Install
npm install -g @autonav/core

# Create a navigator (interactive interview helps you customize it)
autonav init my-docs

# Add your documentation
cp -r ~/docs/* my-docs/knowledge/

# Use it with Claude Code (recommended)
cd my-docs && claude

# Or query directly
autonav query my-docs "How do I deploy?"
```

## Using Your Navigator

Once created, you can interact with your navigator via Claude Code:

```bash
cd my-docs
claude
```

This opens an interactive session with your navigator's context already loaded (via `CLAUDE.md`). You can have conversations, ask follow-ups, and let the navigator search your docs.

The CLI also includes `autonav query` and `autonav chat` commands for scripting. Future versions will add more ways to automate navigators - Slack integration, scheduled check-ins, and other plugins.

## Architecture

Three parts:

1. **Autonav** - CLI and SDK adapter. Handles init, query, validation.
2. **Communication Layer** - Protocol schemas. Defines response format, validation rules.
3. **Knowledge Packs** - Downloadable starter content. HTTP-distributed, community-created.

## Project Structure

```
packages/
  autonav/              # CLI + ClaudeAdapter
  communication-layer/  # Schemas and validation
packs/
  platform-engineering/ # Example knowledge pack
docs/
  KNOWLEDGE_PACK_PROTOCOL.md  # How to create/host packs
```

## Learn More

| Resource | Description |
|----------|-------------|
| [Knowledge Pack Protocol](docs/KNOWLEDGE_PACK_PROTOCOL.md) | Create and distribute your own knowledge packs |
| [Autonav CLI](packages/autonav/README.md) | CLI commands and ClaudeAdapter API |
| [Communication Layer](packages/communication-layer/README.md) | Response schemas and validation |
| [Navigator Structure](packages/communication-layer/src/protocols/navigator-structure.md) | What files make up a navigator |

## Development

```bash
npm install
npm run build
npm test
```

## Status

Phase 1 complete - core framework works with Slack, GitHub, and FileWatcher plugins. Self-configuration tools implemented. Next: end-to-end testing and Signal plugin.
