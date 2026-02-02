# Refactor Templates and Skills to Communication Layer

**Date:** 2026-02-01
**Status:** Approved
**Author:** Claude Code + Terra

## Overview

Refactor navigator templates and skill management from autonav core to communication-layer, establishing communication-layer as the single source of truth for navigator structure and inter-agent communication protocols.

## Goals

1. **Eliminate template duplication** between communication-layer and autonav
2. **Prevent directory changes** in skill templates using RFC-2119 requirements
3. **Centralize navigator infrastructure** in communication-layer
4. **Clear separation of concerns**: infrastructure (comms) vs. CLI (autonav)

## Problem Statement

**Current issues:**
- Template duplication: communication-layer has reference templates, autonav has active templates
- Risk of drift between the two template sets
- Skill management logic lives in autonav but is fundamentally about communication
- Skill templates don't explicitly prevent Claude Code from changing directories
- No clear package responsibility boundaries

## Design

### Package Responsibilities

**@autonav/communication-layer** - Navigator infrastructure:
- **Templates**: Partials and composition functions for all navigator files
- **Skills**: Content generation and management (create, symlink, remove)
- **Protocols**: How navigators communicate with Claude Code and each other
- **Schemas**: Zod schemas for validation
- **Prompts**: Runtime prompts (GROUNDING_RULES, etc.)

**@autonav/core** - CLI orchestrator:
- **CLI commands**: nav-init, nav-query, nav-chat, nav-mend, nav-migrate
- **User interaction**: Prompts, confirmations, output formatting
- **Orchestration**: Calls communication-layer functions
- **Adapters**: Claude SDK integration
- **Pack installation**: Downloads and extracts knowledge packs

### Module Structure

**New communication-layer structure:**

```
communication-layer/src/
├── templates/
│   ├── partials/
│   │   ├── grounding-rules.ts          # GROUNDING_RULES constant
│   │   ├── response-format.ts          # Response JSON schema docs
│   │   ├── navigator-authority.ts      # Authority protocol
│   │   ├── confidence-levels.ts        # Confidence scoring
│   │   └── index.ts                    # Export all partials
│   ├── generators/
│   │   ├── claude-md.ts                # generateClaudeMd()
│   │   ├── config-json.ts              # generateConfigJson()
│   │   ├── plugins-json.ts             # generatePluginsJson()
│   │   ├── readme.ts                   # generateReadme()
│   │   └── index.ts                    # Export all generators
│   └── index.ts                        # Re-export everything
├── skills/
│   ├── generators.ts                   # generateSkillContent, generateUpdateSkillContent
│   ├── management.ts                   # createLocalSkill, symlinkSkillToGlobal, etc.
│   ├── utils.ts                        # getSkillName, skillExists, etc.
│   └── index.ts                        # Export all skill functions
├── prompts/                            # (existing)
├── schemas/                            # (existing)
├── validation/                         # (existing)
└── index.ts                            # Export everything
```

**Note:** Structure may be flattened during implementation if deeply nested directories become annoying to maintain.

### Template Composition Pattern

**Partials (exported constants):**
```typescript
// communication-layer/src/templates/partials/grounding-rules.ts
export const GROUNDING_RULES = `
## Grounding Rules

You MUST follow these rules when answering questions:
1. Always cite sources from the knowledge base
2. Quote directly from files
...
`;
```

**Generators (composition functions):**
```typescript
// communication-layer/src/templates/generators/claude-md.ts
import { GROUNDING_RULES, RESPONSE_FORMAT } from '../partials/index.js';

export function generateClaudeMd(vars: NavigatorVars): string {
  return `# Navigator: ${vars.name}

${vars.description}

${GROUNDING_RULES}

${RESPONSE_FORMAT}

${vars.customInstructions || ''}
`;
}
```

**Usage in autonav:**
```typescript
// autonav/src/cli/nav-init.ts
import { generateClaudeMd, generateSkillContent } from '@autonav/communication-layer';

const claudeMd = generateClaudeMd({ name, description, scope });
const skillContent = generateSkillContent({ navigatorName, ... });
```

### Skill Template Changes (RFC-2119)

**Problem:** Current templates don't explicitly prevent Claude Code from changing directories to navigators.

**Solution:** Add RFC-2119 requirements to skill templates:

```markdown
## How to Use

**RFC-2119 Requirements:**

You MUST run `autonav query` from your current working directory.

You MUST NOT change directory to the navigator location.

You MUST use the absolute navigator path:

```bash
autonav query "${navPath}" "your question here"
```

**Forbidden (MUST NOT):**
- ❌ `cd ${navPath} && autonav query . "question"`
- ❌ Changing your working directory to the navigator
- ❌ Using relative paths to the navigator

**Required (MUST):**
- ✅ Use absolute path: `autonav query "${navPath}" "question"`
- ✅ Stay in your current working directory
- ✅ Let autonav handle navigator location

**Optional (MAY):**
- You MAY use environment variables or shell expansions in the path
- You MAY wrap the command in scripts, but MUST preserve the absolute path
```

### Command Responsibilities

**autonav mend** - Health checks and repairs:
- Validates navigator structure (directories, files, skills)
- Fixes missing directories, broken symlinks
- Detects outdated skill templates
- Suggests running `autonav migrate` if templates are outdated
- Does NOT regenerate skill content itself

**autonav migrate** - Version migrations:
- Updates navigator to latest version
- Regenerates templates/skills when needed
- Applies breaking changes
- Can be run with `--auto-fix` after confirmation

**Example flow:**
```bash
$ autonav mend ./my-navigator
✗ ask-my-navigator skill has outdated template
💡 Run: autonav migrate ./my-navigator --auto-fix

$ autonav migrate ./my-navigator --auto-fix
⚠️  WARNING: Will update navigator files
Apply migration v1.4.0? (yes/no): yes
✓ Regenerated ask-my-navigator skill with RFC-2119 guidance
✓ Regenerated update-my-navigator skill
✓ Navigator is up to date
```

## Implementation Plan

### Phase 1: Create New Structure
1. Create `communication-layer/src/templates/` structure
2. Create `communication-layer/src/skills/` module
3. Extract partials from existing templates
4. Implement template generators
5. Move skill functions from autonav to communication-layer

**Deliverable:** Communication-layer exports all template/skill functions

### Phase 2: Update Autonav
1. Update autonav imports to use communication-layer
2. Replace template file reads with generator function calls
3. Update nav-init.ts, nav-mend.ts, etc.
4. Ensure all CLI commands work with new imports

**Deliverable:** Autonav CLI works with communication-layer templates

### Phase 3: Migration System
1. Create migration v1.4.0 (or v1.3.6?)
2. Regenerate skills with RFC-2119 guidance
3. Update mend to detect outdated skills
4. Add suggestion to run `autonav migrate`

**Deliverable:** Existing navigators can be migrated to new templates

### Phase 4: Cleanup
1. Delete `autonav/src/templates/*.template` files
2. Delete `autonav/src/skill-generator/` directory
3. Delete `communication-layer/src/templates/*.template` legacy files
4. Update documentation

**Deliverable:** Clean codebase with no duplication

## Testing Strategy

**After Phase 1:**
- Build communication-layer successfully
- Verify all exports are available
- Unit tests for template generators

**After Phase 2:**
- `autonav init my-nav` creates working navigator
- Generated CLAUDE.md has RFC-2119 requirements
- Generated skills have directory change warnings
- All existing CLI commands still work

**After Phase 3:**
- `autonav migrate` updates existing navigators
- `autonav mend` detects outdated templates
- Migration can be applied with confirmation

**Integration tests:**
- Create new navigator
- Query navigator
- Mend navigator (should be healthy)
- Migrate navigator (should detect no changes needed)

## Version Considerations

**Question:** Is this a breaking change?

**Analysis:**
- Existing navigators continue to work (no breaking change to runtime)
- New navigators get updated templates (enhancement)
- Migration updates existing navigators (opt-in)
- Communication-layer API changes but autonav is the only consumer

**Recommendation:** Version as v1.4.0 (minor bump with migration available)

Alternatively v1.3.6 if we consider this purely internal refactoring.

## Success Criteria

- ✅ No template duplication between packages
- ✅ Single source of truth in communication-layer
- ✅ Skills explicitly prevent directory changes (RFC-2119)
- ✅ Clear package boundaries (infrastructure vs CLI)
- ✅ All tests pass
- ✅ Existing navigators can be migrated
- ✅ New navigators use updated templates

## Risks and Mitigations

**Risk:** Breaking existing navigators
- **Mitigation:** Backward compatible, migration is opt-in

**Risk:** Template structure becomes too complex
- **Mitigation:** Keep it simple, flatten if nested directories are annoying

**Risk:** Missed template references during refactor
- **Mitigation:** Comprehensive testing after each phase

**Risk:** Skill regeneration loses custom modifications
- **Mitigation:** Mend only suggests migration, doesn't auto-apply

## Future Considerations

- Could add template validation tests (ensure generated output matches expected format)
- Could add template versioning (track which version generated each file)
- Could make skill templates configurable per navigator
- Could add more RFC-2119 guidance to other parts of navigator protocols

## References

- [RFC-2119: Key words for use in RFCs to Indicate Requirement Levels](https://www.ietf.org/rfc/rfc2119.txt)
- [Navigator Structure Protocol](../protocols/navigator-structure.md)
- [CLAUDE.md](../../CLAUDE.md) - Project context
