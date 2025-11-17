# Platform AI - Development Guide

**Project Status**: 🚧 Early MVP Phase - Rapid Iteration

You are helping build a multi-agent Platform AI system. This is a monorepo containing packages for building knowledge navigators and observation agents.

---

## Project Context

### What We're Building
A system that helps platform engineers manage organizational knowledge and reduce support toil through intelligent agents:
- **Navigators**: Answer questions by searching curated documentation
- **Watchers**: Observe support channels, categorize questions, extract insights

### Core Philosophy
- **Leftover Principle**: Humans curate insights, LLMs organize and surface knowledge
- **Stochastic Parrots**: LLMs don't invent knowledge, they organize existing knowledge
- **Human-Centric**: Keep humans in the loop where they add most value

### The Breakthrough
Claude Agent SDK eliminates vector databases, embedding services, and complex ingestion pipelines. Just Git repos + agentic search.

---

## Current Phase: Navigator MVP

**Goal**: Prove the abstraction works. Build a navigator that answers questions accurately with citations.

**Timeline**: Hackathon style (8 hours)

**Components to build**:
1. Communication Layer v1 (schemas, prompts, validation)
2. Claude SDK Adapter (execution engine)
3. Navigator Framework (CLI tools: nav-init, nav-query)
4. Example Platform Navigator (proof of concept)

---

## Architecture Overview

### 4-Component Design

```
┌─────────────────────────────────────────────────────┐
│ Navigator Framework / Watcher Framework             │
│ (High-level tools and CLIs)                         │
└────────────────┬────────────────────────────────────┘
                 │ uses
                 ▼
┌─────────────────────────────────────────────────────┐
│ Claude SDK Adapter                                   │
│ (Execution: load, execute, parse, validate)         │
└────────────────┬────────────────────────────────────┘
                 │ uses
                 ▼
┌─────────────────────────────────────────────────────┐
│ Communication Layer                                  │
│ (Protocol: schemas, prompts, validation)            │
└─────────────────────────────────────────────────────┘
```

**Key separation**:
- Communication Layer = WHAT (protocol definitions)
- SDK Adapter = HOW (execution engine)
- Framework = WHO (navigators, watchers)

---

## Development Priorities

### Phase 1 (Current - Hackathon)

**Build in this order**:
1. Communication Layer v1 (2h)
   - Schemas: NavigatorResponse, Source, NavigatorConfig
   - Prompt templates: answerQuestion, scoreConfidence, extractSources
   - Validation: checkSourcesExist, detectHallucinations
   - Package as npm module

2. Claude SDK Adapter (2h)
   - ClaudeAdapter class
   - loadNavigator() - reads CLAUDE.md + config.json
   - parseResponse() - converts SDK output to CL schemas
   - validate() - runs hallucination detection
   - Package as npm module

3. Navigator Framework (2h)
   - nav-init CLI (scaffold new navigator)
   - nav-query CLI (query a navigator)
   - CLAUDE.md template with grounding rules
   - Package as npm module

4. Example Platform Navigator (2h)
   - Create working navigator with 5-7 docs
   - Test 5 questions - all must answer correctly with citations
   - Iterate on prompts if needed

**Success criteria**:
- ✅ Example navigator answers 5/5 questions correctly
- ✅ Responses cite real files (no hallucinations)
- ✅ All 3 packages published and documented
- ✅ Demo inspires team: "I want to build one!"

### Future Phases (Defer for Now)

- Phase 2: Watcher framework + Slack integration
- Phase 3: Multi-navigator communication
- Phase 4: Production hardening (hallucination detection, analytics)

---

## Key Design Decisions

### 1. Versioning
**Everything is versioned from day 1.**

- All schemas include `version` or `protocolVersion` field
- config.json declares `communicationLayerVersion`
- CLAUDE.md has version frontmatter
- See VERSIONING_STRATEGY.md for full details

**MVP scope**: Add version fields, log warnings on mismatch (don't block yet)

**Future scope**: Build `nav-upgrade` migration tool

### 2. Monorepo Structure
Use npm workspaces:
```json
{
  "workspaces": [
    "packages/*",
    "packs/*"
  ]
}
```

**Why monorepo**: Atomic commits across packages, easier iteration, platform engineering standard (Kubernetes, Istio, Calico all use monorepos)

### 3. Hallucination Prevention
Navigators must cite sources. Grounding rules in CLAUDE.md:
- Always cite file paths for answers
- If unsure, say "I don't have information about that"
- Never invent commands, file paths, or AWS resources

SDK Adapter validates responses:
- Check cited files actually exist
- Detect common hallucination patterns
- Flag low-confidence responses for review

### 4. Navigator-as-Directory Pattern
Any directory with:
- `config.json` (version, name, dependencies)
- `CLAUDE.md` (instructions, grounding rules)
- `knowledge/` (docs to search)

...becomes an autonomous navigator.

---

## Code Style & Conventions

### TypeScript
- Use strict mode
- Explicit return types on public functions
- Zod for runtime schema validation
- Prefer composition over inheritance

### Project Structure
```
packages/communication-layer/
├── src/
│   ├── schemas/         # Zod schemas
│   ├── prompts/         # Prompt templates
│   └── validation/      # Validation utilities
├── tests/
├── package.json
└── README.md

packages/claude-sdk-adapter/
├── src/
│   ├── adapter.ts       # Main ClaudeAdapter class
│   ├── loader.ts        # Load navigators from filesystem
│   ├── parser.ts        # Parse SDK responses
│   └── validator.ts     # Validate responses
├── tests/
├── package.json
└── README.md

packages/navigator-framework/
├── src/
│   ├── cli/
│   │   ├── init.ts      # nav-init command
│   │   └── query.ts     # nav-query command
│   ├── templates/       # Navigator templates
│   └── index.ts
├── tests/
├── package.json
└── README.md
```

### Testing
- Unit tests for all validation logic
- Integration tests for SDK Adapter
- End-to-end tests for CLI commands
- Test navigator with known Q&A pairs

### Documentation
- Each package needs a README with:
  - What it does
  - How to use it
  - API reference
  - Examples
- CHANGELOG.md for version tracking
- Architecture decisions in docs/

---

## Common Tasks

### Setting Up Monorepo
```bash
# Initialize workspace
npm init -w packages/communication-layer
npm init -w packages/claude-sdk-adapter
npm init -w packages/navigator-framework

# Install shared dependencies at root
npm install -D typescript @types/node tsx vitest

# Install package-specific deps
npm install zod -w packages/communication-layer
```

### Building a Package
```bash
cd packages/communication-layer
npm run build    # tsc to compile
npm test         # vitest
npm run dev      # watch mode
```

### Linking Packages Locally
```json
// packages/claude-sdk-adapter/package.json
{
  "dependencies": {
    "@platform-ai/communication-layer": "*"
  }
}
```

Workspace automatically links local packages.

### Publishing (Future)
```bash
npm run build --workspaces
npm publish --workspace packages/communication-layer
```

---

## Working with Claude Agent SDK

### Installation
```bash
npm install @anthropic-ai/agent-sdk
```

### Basic Usage
```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  workingDirectory: '/path/to/navigator/knowledge',
  systemPrompt: claudeMdContent,
});

const response = await agent.query("How do I deploy?");
```

The SDK provides agentic search (Grep, Read, Bash tools) automatically.

---

## Hallucination Detection Patterns

Watch for these in responses:
- File paths that don't exist in the knowledge base
- Made-up AWS resource names (e.g., `arn:aws:s3:::fake-bucket`)
- Commands that aren't documented
- Confident answers when docs don't contain the info
- Missing source citations

Validation logic:
```typescript
function validateSources(response: NavigatorResponse, knowledgeBase: string[]) {
  for (const source of response.sources) {
    if (!knowledgeBase.includes(source.filePath)) {
      throw new HallucinationError(`File ${source.filePath} doesn't exist`);
    }
  }
}
```

---

## Questions & Decision Points

### Need to Decide:
1. **Package naming**: `@platform-ai/*` or different org name?
2. **License**: Apache 2.0 or MIT?
3. **Testing framework**: Vitest or Jest?
4. **Build tool**: tsc + npm scripts or tsup/unbuild?

### Open Questions:
1. How should navigators handle multiple versions of the same doc?
2. What's the best way to structure prompt templates?
3. Should we support plugins for custom validation?

---

## Getting Unstuck

### If you're unsure about architecture:
- Check VERSIONING_STRATEGY.md for version design
- Check README.md for high-level overview
- Ask: "Does this align with the leftover principle?"

### If you're stuck on implementation:
- Start with the simplest thing that could work
- Build for Phase 1 only (defer complexity)
- Test with the example navigator

### If tests are failing:
- Check version compatibility
- Verify file paths in responses actually exist
- Look for hallucination patterns

---

## Success Metrics (Phase 1)

Track these during development:
- [ ] Communication Layer schemas defined and validated
- [ ] SDK Adapter loads navigator and executes queries
- [ ] CLI tools work: `nav-init`, `nav-query`
- [ ] Example navigator answers 5/5 questions correctly
- [ ] All responses cite real files
- [ ] No hallucinated content detected
- [ ] Packages build and install correctly

**Demo readiness**: Can you show this to platform engineers and hear "I want to build one!"?

---

## Remember

- **Move fast**: This is MVP/hackathon style
- **Test early**: Don't build all 3 packages before testing integration
- **Version everything**: Add version fields now, saves pain later
- **Keep humans in the loop**: System augments, doesn't replace
- **Hallucination is the enemy**: Validate, validate, validate

---

## Next Steps After Phase 1

Once Navigator MVP works:
1. Get feedback from 2-3 platform engineers
2. Refine based on learnings
3. Plan Phase 2: Watcher framework + Slack integration
4. Consider: Open source the project? Grafana Labs involvement?

---

**You've got this!** Build something that makes platform engineers' lives better. Follow the dopamine. Ship value fast.
