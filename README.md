# Platform AI

**Status**: 🚧 Early MVP Phase - Active Development

[![CI](https://github.com/terraboops/platform-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/terraboops/platform-ai/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-TBD-lightgrey.svg)](LICENSE)

Multi-agent Platform AI system that multiplies the potential of platform engineers by capturing, organizing, and surfacing organizational knowledge at scale.

---

## What Is This?

Platform AI helps platform engineering teams tackle knowledge management and support toil through intelligent agents that:

- **Navigate knowledge**: Answer questions by searching curated documentation (Navigators)
- **Watch for patterns**: Observe support channels, categorize questions, extract insights (Watchers)
- **Compose expertise**: Specialized agents communicate and share knowledge

**The Breakthrough**: Built on Claude Agent SDK, eliminating 75% of typical infrastructure complexity. No vector databases, no embedding services, no complex ingestion pipelines. Just Git repos + agentic search + simple wrappers.

---

## Philosophy

### The Leftover Principle
Humans handle insights, discovery, and curation. LLMs organize and surface existing knowledge at the right time.

**AI handles**:
- Categorizing support requests
- Searching documentation
- Detecting patterns
- Organizing knowledge
- Surfacing context

**Humans handle**:
- Curating what's canonical
- Adding new insights
- Making judgment calls
- Strategic decisions
- Novel problem-solving

### Stochastic Parrots (Bender et al., 2021)
LLMs don't produce new knowledge, but they're exceptional at organizing what exists. This system embraces that reality.

---

## Architecture

### 4-Component Design

1. **Communication Layer** - Protocol definitions, schemas, validation (no execution)
2. **Claude SDK Adapter** - Execution engine bridging Claude Agent SDK ↔ Communication Layer
3. **Navigator Framework** - Toolkit for building knowledge navigators (`nav-init`, `nav-query`)
4. **Watcher Framework** - Toolkit for building observation agents (Slack, GitHub, etc.)

### Monorepo Structure

```
platform-ai/
├── packages/
│   ├── communication-layer/    # Protocol v1 (schemas, prompts, validation)
│   ├── claude-sdk-adapter/     # Execution engine
│   ├── navigator-framework/    # Navigator toolkit + CLI
│   └── watcher-framework/      # Watcher toolkit (Phase 2)
├── examples/
│   └── platform-navigator/     # Example navigator with sample docs
├── docs/
│   ├── VERSIONING_STRATEGY.md  # Version upgrade process
│   └── ARCHITECTURE.md         # Detailed design
└── package.json                # Workspace root
```

---

## Current Phase: Navigator MVP

**Goal**: Build a working Navigator that answers platform engineering questions by searching curated docs in a Git repo.

**Scope** (Phase 1 - Hackathon Style):
- ✅ Communication Layer v1 (schemas, prompt templates, validation)
- ✅ Claude SDK Adapter (load, execute, parse, validate)
- ✅ Navigator Framework CLI (`nav-init`, `nav-query`)
- ✅ Example Platform Navigator (5-7 docs, 5 test questions)
- ✅ Versioning strategy (version all the things)

**Success Criteria**:
- Example navigator answers 5/5 test questions accurately with file citations
- No made-up file paths or commands (hallucination detection)
- Demo inspires: "I want to build one for my domain!"

---

## Roadmap

### Phase 1: Navigator MVP (In Progress)
Build the foundation - prove agentic search works, validate abstraction.

### Phase 2: Watcher + Slack Integration (Week 2)
Passive observation, categorization, knowledge extraction, bookend interactions.

### Phase 3: Multi-Navigator Communication (Weeks 3-4)
Specialized navigators (Terraform, Helm, Security) that query each other.

### Phase 4: Production Hardening (Month 2)
Hallucination detection, CI/CD integration, analytics, measurable toil reduction.

---

## Key Design Decisions

### Versioning
Everything is versioned from day 1. Breaking changes are rare. When they happen, automated migration tools transform files.

See [VERSIONING_STRATEGY.md](./docs/VERSIONING_STRATEGY.md) for details.

### Navigator-as-Directory Pattern
Any directory with `CLAUDE.md` + `config.json` becomes an autonomous navigator. Navigators discover and communicate with each other.

### Human-Centric
Humans stay in the loop where they add most value. This system augments human expertise, doesn't replace it.

---

## Quick Start

**Coming soon** - Navigator Framework CLI for building your first navigator in 5 minutes.

```bash
# Initialize a new navigator
npx @platform-ai/navigator-framework init ./my-navigator

# Add your documentation
cp -r ./docs/* ./my-navigator/knowledge/

# Query your navigator
npx @platform-ai/navigator-framework query ./my-navigator "How do I deploy to production?"
```

---

## Development

This is a monorepo managed with npm workspaces.

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Develop a specific package
cd packages/communication-layer
npm run dev
```

---

## Contributing

**Note**: This project is in early MVP phase. The architecture and APIs will change rapidly as we learn and iterate.

If you're interested in contributing or using this, please open an issue to discuss first!

---

## License

TBD - Will likely be Apache 2.0 or MIT once we move out of MVP phase.

---

## References

- **Leftover Principle**: https://dl.acm.org/doi/abs/10.1145/2844546
- **Stochastic Parrots**: https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/084b6fbb10729ed4da8c3d3f5a3ae7c9-Abstract-round2.html
- **Claude Agent SDK**: https://docs.claude.com/en/docs/agent-sdk/overview

---

**Built with**: Claude Agent SDK, TypeScript, Node.js

**Status**: Private repo during MVP phase. Will consider open sourcing after Phase 1 validation.
