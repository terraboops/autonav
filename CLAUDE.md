# Autonav - Development Guide

**Project Status**: 🚀 Phase 1 Complete - Ready for End-to-End Testing (Phase 2A)

You are helping build Autonav, an LLM-agnostic context management system built on Claude Code SDK. This is a framework for creating autonomous navigators ("navs") powered by curated knowledge packs.

---

## Project Context

### What We're Building

A general-purpose system for managing LLM context through autonomous navigators:
- **Autonav Framework**: Claude Code SDK implementation with specific assumptions
- **Knowledge Packs**: Community-curated starter packs distributed via HTTP
- **Self-Configuring Navs**: Agents that manage their own configuration
- **LLM-Agnostic**: Initially Claude Code SDK, future support for Gemini CLI and others

### Core Philosophy

- **Stochastic Parrots as Feature**: LLMs don't create knowledge, they organize existing knowledge exceptionally well
- **Context Management is the Problem**: Giving LLMs the right context at the right time is the real challenge
- **Navs as LLM Abstraction**: Just as containers are the abstraction for deploying software, navs are the abstraction for interacting with LLMs
- **Follow the Dopamine**: Interest and curiosity are valuable signals, not distractions

### The Breakthrough

Knowledge packs enable community-driven knowledge sharing without package coordination complexity. HTTP-based distribution means anyone can create and share packs without central approval.

---

## Architecture Overview

### Three-Component Design

**NOT a multi-package monorepo** - Three architectural **components**:

```
┌─────────────────────────────────────────────┐
│ Autonav Framework                           │
│ ┌─────────────────────────────────────────┐ │
│ │ Communication Layer (directory)         │ │
│ │ - Claude Code configuration             │ │
│ │ - Repo structure definitions            │ │
│ │ - Nav templates                         │ │
│ │ - Command → skill mappings              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Plugins (hard-coded initially)          │ │
│ │ - Slack, Signal integrations            │ │
│ │ - Config in nav's .claude/ directory    │ │
│ │ - Self-configuring                      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
            │
            │ downloads via HTTP
            ▼
┌─────────────────────────────────────────────┐
│ Knowledge Packs                             │
│ - Platform engineering                      │
│ - Personal assistant                        │
│ - Kubernetes, AWS, etc.                     │
│ - Community-created                         │
└─────────────────────────────────────────────┘
```

**Key Separation**:
- Autonav Framework = The main system (programs and bits that make it work)
- Communication Layer = Embedded Claude Code config (NOT a separate package)
- Knowledge Packs = HTTP-distributed community content

---

## Current Phase: Foundation Development

**Goal**: Build the core framework and prove the abstraction works.

**Initial Use Case**: Personal projects (NOT enterprise/organizational - that's deferred)

**Components to Build**:

1. **Autonav Framework** - Main system
   - CLI commands: `autonav init`, `autonav query`
   - Claude Code SDK integration
   - Plugin system (hard-coded initially)
   - Configuration management

2. **Communication Layer** - Embedded directory
   - Repo structure definitions
   - Initial claude.md templates
   - Commands that trigger skills
   - Nav-to-nav communication protocols (future-proofed)
   - **Kept architecturally separate** for future extraction

3. **Knowledge Pack System**
   - HTTP distribution protocol
   - Example pack: platform-engineering
   - Installation via `autonav init --pack <name>`
   - One knowledge pack per nav

4. **Structured Outputs Integration**
   - Use Anthropic's Structured Outputs feature
   - Enforce JSON schemas directly
   - Simplify validation logic
   - See: https://docs.claude.com/en/docs/build-with-claude/structured-outputs

---

## Key Design Decisions

### 1. Three Components, Not Four Packages

**Previous thinking** (INCORRECT):
- Four separate npm packages
- Complex monorepo coordination
- Communication Layer as standalone package

**Current vision** (CORRECT):
- Single Autonav framework
- Communication Layer embedded as directory
- Knowledge Packs distributed via HTTP (not npm)
- Simpler, clearer architecture

**Rationale**: Embedding reduces complexity. HTTP distribution enables community without package coordination.

### 2. Knowledge Packs - The Killer Feature

**What They Are**:
- Starter packs for navs - "pieces of engineered context"
- Community-curated sets of configuration + markdown
- Must include `system-configuration.md`
- One knowledge pack per nav

**Distribution**:
- HTTP-based with knowledge pack protocol
- Anyone can implement knowledge pack servers
- Users download from wherever they want
- Installation: `autonav init my-nav --pack platform-engineering`

**Examples**:
- `platform-engineering` (Terra's first pack)
- `personal-assistant` (organize notes, schedule meetings)
- `kubernetes`, `aws-load-balancer-troubleshooting`
- Granularity: Creator decides (domain-level or specific)

**Vision**:
- Community contribution model
- Companies like AWS could release official packs
- Network effects from shared knowledge engineering
- Multiple people can create packs for same domain

**Strategic Importance**: This differentiates Autonav from "just Claude SDK with docs"

### 3. Communication Layer as Embedded Configuration

**NOT a separate npm package** (for now):
- Directory inside Autonav framework
- Claude Code configuration files
- Templates for claude.md initialization
- Command and skill definitions
- Inter-navigator protocols

**Why Keep it Separate Architecturally**:
- Easier to extract later if needed
- Clear conceptual boundary
- Potential reuse in other projects

**What It Defines**:
- Repository structure for navs
- How navigators work
- How navigators communicate with each other
- Initial setup and scaffolding

### 4. Plugins Handle Both Input and Output

**Previous thinking** (ABANDONED): "Senses and Voices" - separate input and output plugins

**Current vision**: Unified plugins
- Single plugin handles both input and output
- Examples: Slack integration, Signal integration
- Rationale: Almost always need both together (can't have Slack input without output)

**Why Unified?**
From voice conversation: "In almost every situation beyond the most obvious, you're gonna want both input and output in the same piece. Like, if I'm building something that integrates with Slack, I'm not just going to want to have input from Slack or have a Slack integration that only does output. Because ultimately I'm gonna have to stitch those two things together somewhere."

**Implementation Status**:

**Phase 1 (COMPLETE)**:
- Slack plugin (FULL) - WebClient integration, channel monitoring, message sending
- GitHub plugin (FULL) - Octokit integration, issues/PRs monitoring, create/update
- FileWatcher plugin - Chokidar-based file system watching
- Configuration in `.claude/plugins.json`
- Self-configuration tools: `update_plugin_config`, `get_plugin_config`
- Built into Autonav framework

**Phase 2A (IN PROGRESS)**:
- Signal plugin - NOT YET IMPLEMENTED
- End-to-end self-configuration testing
- Email plugin - deferred

**Phase 2 (Future)**:
- Email plugin - Read questions + send answers
- Additional plugin features as needed

**Phase 3 (Advanced Integrations)**:
- Incident Response plugin - Monitor alerts + post runbooks + create summaries
- Wiki/Documentation plugin - Detect gaps + create/update pages
- Ticketing plugin (Jira, Linear) - Monitor tickets + create/update
- Runbook Execution plugin - Track executions + capture learnings

**Configuration Lives in Nav's `.claude/` Directory**:
```json
{
  "workspaces": [
    "packages/*",
    "packs/*"
  ],
  "slack": {
    "enabled": false,
    "workspace": "",
    "channels": [],
    "threadNotifications": true,
    "summaryFrequency": "daily"
  },
  "signal": {
    "enabled": true,
    "phoneNumber": "+1234567890",
    "checkInSchedule": "daily",
    "checkInTime": "09:00",
    "notificationTypes": ["urgent", "daily-summary"]
  },
  "github": {
    "enabled": false,
    "repositories": [],
    "issueLabels": [],
    "autoRespond": false
  },
  "email": {
    "enabled": false,
    "addresses": [],
    "digestFrequency": "weekly"
  }
}
```

**Self-Configuration Examples**:

1. **Scheduling Check-ins**:
   - User: "Please check in with me tomorrow at 3pm"
   - Nav: Updates `.claude/plugins.json`:
   ```json
   {
     "signal": {
       "checkInSchedule": "custom",
       "nextCheckIn": "2025-11-17T15:00:00Z"
     }
   }
   ```

2. **Channel Management**:
   - User: "Stop posting in #general, only post in #platform-team"
   - Nav: Updates `slack.channels: ["platform-team"]`

3. **Notification Preferences**:
   - User: "Only notify me about urgent issues"
   - Nav: Updates `signal.notificationTypes: ["urgent"]`

**Plugin Interface Design** (Later Phases):
```typescript
interface Plugin {
  name: string;
  version: string;

  // Input side
  listen(): Promise<Event[]>;

  // Output side
  send(message: Message): Promise<void>;

  // Configuration
  configure(config: PluginConfig): void;
  getConfig(): PluginConfig;
}
```

**No External Orchestration Needed**:
Navs manage their own behavior through self-configuration. No scheduler, no external orchestrator - just the nav updating its own config based on conversations.

### 5. Self-Configuring Navs

**Key Insight**: Navs manage themselves rather than needing external orchestration

**How It Works**:
- Plugin config lives in nav's `.claude/` directory
- Nav has write access to its own configuration
- Can schedule tasks, modify behavior, adapt to user requests
- Autonomous, not controlled

**Benefits**:
- Reduces system complexity
- Enables natural conversations about scheduling/behavior
- Navs become true autonomous agents

### 6. Structured Outputs Simplifies Validation

**New Technology** (recently released by Anthropic):
- Specify exact JSON output format with schemas
- Enforces schemas directly in Claude's responses
- See: https://docs.claude.com/en/docs/build-with-claude/structured-outputs

**Impact on Communication Layer**:
- Drastically simplifies validation logic
- JSON structure validation handled automatically
- May reduce need for manual hallucination detection
- Communication layer focuses on logic, not validation

**Need to Explore**: Exactly how much validation can be eliminated

### 7. LLM-Agnostic Vision

**Goal**: Autonav as general context management system

**Currently Supported Providers**:
- **Claude** (default) - Claude Code SDK with streaming support
- **OpenCode** - Open-source multi-provider CLI tool (supports OpenAI, Anthropic, Ollama, etc.)

**Provider Selection**:
```bash
# Via environment variable
export AUTONAV_PROVIDER=opencode
export AUTONAV_MODEL=openai:gpt-4o

# Via CLI flag
autonav query ./my-nav "question" --provider opencode --model anthropic:claude-sonnet-4-20250514
autonav chat ./my-nav --provider claude
autonav init my-nav --from ./repo --provider opencode
```

**Adapter Architecture**:
- `LLMAdapter` interface in `src/adapter/types.ts`
- `ClaudeAdapter` - Uses Claude Agent SDK with streaming
- `OpenCodeAdapter` - Spawns OpenCode CLI subprocess
- `createAdapter()` factory function for provider selection

**Future Support**:
- Gemini CLI
- Other CLI-based LLM toolings
- All LLMs support tool use → Autonav can be a tool

**Long-Term Vision**:
- Navs become THE way to work with LLMs
- Other LLM providers build similar systems
- Autonav makes Anthropic the platform for building navs
- Takes stochastic parrot criticisms seriously
- Language alone doesn't make intelligence - context management does

### 8. Navigator-as-Directory Pattern

Any directory with these files becomes an autonomous navigator:
- `config.json` - Version, name, configuration
- `CLAUDE.md` - System prompt, grounding rules
- `.claude/` - Plugin configurations
- `knowledge/` - Documentation and context (from knowledge pack)
- `system-configuration.md` - Knowledge pack configuration

**Benefits**:
- Self-contained units
- Git-friendly (version controlled)
- Easy to discover and share
- Composable (navs can communicate)
- Low ceremony

### 9. Personal Use First, Not Enterprise

**Scope Decision**: Building for personal projects initially

**Deferred** (NOT important for MVP):
- Deployment/organizational use cases
- Multi-tenancy
- Authentication systems
- Operator dashboards
- Production hardening
- Analytics and metrics

**Rationale**:
- Focus on core functionality
- Prove the abstraction works
- Personal use validates the concept
- Organizational use cases can come later (or never)

### 10. Versioning from Day 1

**Everything is versioned**:
- config.json declares version
- Knowledge packs versioned
- Communication layer protocols versioned
- CLAUDE.md has version frontmatter

**MVP Scope**: Add version fields (don't build migration tools yet)

**Future Scope**: `autonav upgrade` tool with automated migrations

---

## Development Priorities

### Phase 1: Core Framework ✅ COMPLETE

**Built**:
1. ✅ Autonav CLI
   - `autonav init <name>` - Scaffold new navigator (with interactive interview)
   - `autonav init <name> --pack <pack-name>` - Initialize with knowledge pack
   - `autonav query <navigator> <question>` - Query a navigator
   - `autonav chat <navigator>` - Interactive multi-turn mode

2. ✅ Communication Layer (embedded directory)
   - Repository structure templates
   - Claude.md template with grounding rules
   - Schema definitions (Zod)
   - Validation functions (sources, hallucinations)
   - SELF_CONFIG_RULES for self-configuration

3. ✅ Plugin System
   - Slack plugin (FULL) - WebClient integration
   - GitHub plugin (FULL) - Octokit integration
   - FileWatcher plugin - Chokidar-based
   - Configuration in `.claude/plugins.json`
   - Self-configuration tools implemented

4. ✅ Knowledge Pack Protocol
   - HTTP-based distribution working
   - GitHub installation (full URL, shorthand, SSH)
   - Local file installation
   - Example pack: platform-engineering

5. ✅ Structured Outputs Integration
   - `submit_answer` tool enforces response schema
   - Zod validation at tool invocation time
   - Fallback to text parsing for backward compatibility

### Phase 2A: Enable Daily Use (Current)

**Focus**:
1. End-to-end self-configuration testing
2. Signal plugin implementation
3. Verify tool wiring in Claude agent loop

**Timeline**: Iterative, not hackathon-style (personal project pace)

### Phase 2: Knowledge Pack Ecosystem

**Build**:
- Knowledge pack server implementation
- Community contribution model
- Multiple example packs (personal-assistant, kubernetes, etc.)
- Knowledge pack discovery/registry

**Deferred**: Not essential for proving the concept

### Phase 3: Advanced Features

**Build**:
- Inter-navigator communication
- Installable/configurable plugins
- Multi-LLM support (Gemini CLI)
- Advanced self-configuration

**Deferred**: Only after Phase 1 proves valuable

### Phase 4: Vision (If Successful)

- Autonav as standard way to work with LLMs
- Other LLM providers build similar systems
- Companies release official knowledge packs
- Vibrant community ecosystem

---

## Code Style & Conventions

### TypeScript
- Use strict mode
- Explicit return types on public functions
- Zod for runtime schema validation (combined with Structured Outputs)
- Prefer composition over inheritance

### Project Structure
```
platform-ai/
├── packages/
│   ├── autonav/                    # Main framework
│   │   ├── src/
│   │   │   ├── cli/                # CLI commands (init, query)
│   │   │   ├── communication-layer/  # Embedded config directory
│   │   │   │   ├── templates/      # claude.md templates
│   │   │   │   ├── protocols/      # Communication protocols
│   │   │   │   └── schemas/        # Structured Outputs schemas
│   │   │   ├── plugins/            # Hard-coded plugins
│   │   │   │   ├── slack.ts
│   │   │   │   └── signal.ts
│   │   │   └── knowledge-packs/    # HTTP download logic
│   │   └── package.json
│   └── communication-layer/        # MAY CONSOLIDATE (audit needed)
├── examples/
│   └── platform-navigator/         # Example navigator
├── knowledge-packs/
│   └── platform-engineering/       # Example knowledge pack
└── docs/
```

### Testing
- Unit tests for validation logic
- Integration tests for CLI commands
- Test navigators with known Q&A pairs
- Test knowledge pack installation

### Documentation
- Each component needs clear README
- Architecture decisions in docs/
- Knowledge pack specification
- Plugin API documentation

---

## Common Tasks

### Initialize New Navigator
```bash
# Basic initialization
autonav init my-navigator

# With knowledge pack
autonav init my-assistant --pack personal-assistant
```

### Query Navigator
```bash
autonav query platform-navigator "How do I deploy?"
```

### Create Knowledge Pack
```
knowledge-pack/
├── system-configuration.md   # Required
├── knowledge/                # Documentation
│   ├── deployment.md
│   └── troubleshooting.md
└── .claude/                  # Optional plugin configs
    └── plugins.json
```

### Configure Plugins
```json
// .claude/plugins.json
{
  "signal": {
    "enabled": true,
    "checkInSchedule": "daily",
    "phoneNumber": "+1234567890"
  },
  "slack": {
    "enabled": false
  }
}
```

---

## Working with Claude Code SDK

### Integration Pattern
```typescript
import { Agent } from '@anthropic-ai/agent-sdk';

const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  workingDirectory: navigatorPath,
  systemPrompt: claudeMdContent,
});

const response = await agent.query(question);
```

The SDK provides agentic search (Grep, Read, Bash tools) automatically.

---

## Working with Structured Outputs

### Schema Definition
```typescript
import { z } from 'zod';

const NavigatorResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.object({
    filePath: z.string(),
    relevance: z.string(),
  })),
});
```

### Using Structured Outputs
```typescript
// Anthropic's Structured Outputs feature enforces this schema
const response = await agent.query(question, {
  schema: NavigatorResponseSchema,
});

// Response is guaranteed to match schema
// No manual validation needed
```

See: https://docs.claude.com/en/docs/build-with-claude/structured-outputs

---

## Knowledge Pack Protocol (To Be Designed)

**Requirements**:
- HTTP-based distribution
- Anyone can implement servers
- Versioning support
- Dependency declarations
- Signature/verification (security)

**Questions to Resolve**:
1. What does the HTTP API look like?
2. How are packs versioned?
3. How to handle dependencies between packs?
4. Security model (signed packs)?
5. Discovery mechanism (registry)?

---

## Questions & Decision Points

### Need to Decide:
1. **Communication Layer**: Keep as directory or extract to package? (Lean toward directory for now)
2. **Knowledge Pack Protocol**: Design the HTTP API specification
3. **Structured Outputs**: How much validation can we eliminate?
4. **MCP Protocol**: Should Autonav follow it or be standalone binary?

### Open Questions:
1. How should navs handle multiple versions of same knowledge pack?
2. Can navs install additional knowledge packs after initialization?
3. How to handle knowledge pack conflicts/dependencies?
4. What's the plugin configuration schema?
5. How do navs communicate with each other (Phase 3)?

---

## Getting Unstuck

### If you're unsure about architecture:
- Check README.md for high-level overview
- Check docs/VOICE_SESSION_SUMMARY_2025-11-16.md for what changed
- Ask: "Does this align with the simplified 3-component vision?"

### If you're stuck on implementation:
- Start with simplest thing that could work
- Build for Phase 1 only (defer complexity)
- Personal use first, not enterprise

### If unclear about scope:
- Personal projects first
- Knowledge packs are the differentiator
- LLM-agnostic is the vision
- Organizational use cases deferred

---

## Success Metrics (Phase 1) ✅ ACHIEVED

Track these during development:
- [x] Autonav CLI commands work (init, query, chat)
- [x] Knowledge pack installation works (HTTP, GitHub, local)
- [x] Example navigator answers questions correctly
- [x] Self-configuration tools exist (update_plugin_config, get_plugin_config)
- [x] Structured Outputs via submit_answer tool
- [x] Communication layer templates work
- [x] Plugins implemented: Slack, GitHub, FileWatcher
- [ ] End-to-end self-config testing (Phase 2A)
- [ ] Signal plugin (Phase 2A)

**Demo Readiness**: Core framework works. Self-config needs real-world validation.

---

## Remember

- **Simplicity over complexity**: 3 components, not 4 packages
- **Knowledge packs are the differentiator**: Not just "Claude SDK with docs"
- **Personal use first**: Prove it works for you before scaling
- **LLM-agnostic vision**: Claude Code SDK first, others later
- **Self-configuring navs**: Autonomous agents, not orchestrated tools
- **Follow the dopamine**: Interest and curiosity are valuable signals
- **Version everything**: Add fields now, build migration tools later

---

## What's Different from Original Docs

**Major Changes**:
1. ❌ Four packages → ✅ Three components
2. ❌ Communication Layer as separate package → ✅ Embedded directory
3. ❌ Enterprise platform engineering tool → ✅ Personal use first, general-purpose
4. ❌ "Senses and voices" → ✅ Unified plugins
5. ❌ Complex validation → ✅ Structured Outputs simplifies
6. ❌ Missing knowledge packs → ✅ Knowledge packs are central
7. ❌ Claude-specific → ✅ LLM-agnostic vision
8. ❌ Organizational focus → ✅ Personal projects first

**What Stayed the Same**:
- ✅ Stochastic parrots philosophy
- ✅ Navigator-as-directory pattern
- ✅ Version everything from day 1
- ✅ Grounding and hallucination prevention
- ✅ Context management as core problem

---

## Files That Need Audit

Based on architectural pivot, these may be outdated:
1. `packages/communication-layer/` - May need consolidation into autonav
2. `packages/autonav/` - Check against new vision
3. `examples/platform-navigator/` - Update to use knowledge packs
4. `docs/MVP_ARCHITECTURE.md` - Needs complete rewrite

---

## Next Steps

1. ✅ Document correct architecture
2. ✅ Knowledge pack HTTP protocol implemented
3. ✅ Structured Outputs via tool use
4. ✅ Example knowledge pack (platform-engineering)
5. ✅ Self-configuration tools implemented
6. ⏸️ End-to-end self-config testing in real conversations
7. ⏸️ Signal plugin implementation
8. ⏸️ Create additional knowledge packs (personal-assistant, kubernetes)

---

**You've got this!** Build something that makes working with LLMs better. Follow your interest. Ship value when it feels right.

**Remember**: This is a personal project first. The vision is ambitious, but the execution is iterative and dopamine-driven.
- Always update the flag documentation when making flag changes