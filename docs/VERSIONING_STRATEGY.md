# Versioning Strategy

**Core Principle**: Make breaking changes rare. When they happen, provide automated migration tools.

---

## What Gets Versioned

### 1. Communication Layer (The Protocol)
- **Version format**: Semantic versioning (1.0.0)
- **What's versioned**: Schemas, prompt templates, validation rules
- **Breaking changes**: New required fields, removed fields, changed field types
- **Non-breaking**: New optional fields, additional prompt templates

```typescript
export const PROTOCOL_VERSION = "1.0.0";

export interface NavigatorResponse {
  protocolVersion: string;  // Always included in responses
  query: string;
  answer: string;
  sources: Source[];
  confidence?: number;  // Optional fields are non-breaking additions
  metadata?: Record<string, unknown>;  // Escape hatch for future extensions
}
```

### 2. Navigator Configuration (config.json)
- **Version format**: Semantic versioning
- **Declares compatibility**: Which Communication Layer versions it supports

```json
{
  "version": "1.0.0",
  "name": "platform-navigator",
  "communicationLayerVersion": "^1.0.0",
  "sdkAdapterVersion": "^1.0.0"
}
```

### 3. CLAUDE.md Format
- **Version declared in frontmatter**:
```markdown
---
version: 1.0.0
protocolVersion: 1.0.0
---

# Navigator Instructions
...
```

### 4. SDK Adapter API
- **Version format**: Semantic versioning
- **Breaking changes**: Method signature changes, removed methods
- **Non-breaking**: New methods, new optional parameters

---

## Upgrade Process

### Automated Migration Tool: `nav-upgrade`

When breaking changes happen (e.g., Communication Layer 1.x → 2.0):

```bash
# Check if navigator needs upgrade
nav-upgrade check ./my-navigator

# Output:
# ❌ Navigator uses Communication Layer v1.2.0
# ⚠️  Current protocol version: v2.0.0
# 📋 Migration available: v1.x → v2.0

# Run migration
nav-upgrade migrate ./my-navigator --to 2.0.0

# Output:
# ✅ Updated config.json: communicationLayerVersion 1.2.0 → ^2.0.0
# ✅ Updated CLAUDE.md frontmatter
# ✅ Migrated prompt templates (added new 'reasoning' field)
# ⚠️  Review changes and test before deploying
```

### Migration Process

1. **Detect version mismatch**
   - SDK Adapter checks navigator's `communicationLayerVersion`
   - If incompatible, suggests running `nav-upgrade`

2. **Run migration**
   - `nav-upgrade` reads current navigator version
   - Applies transformation pipeline based on version gap
   - Updates config.json, CLAUDE.md, and any custom prompt files

3. **Verify migration**
   - `nav-upgrade verify ./my-navigator` runs test queries
   - Confirms responses match new schema
   - Flags any issues for manual review

### Migration Transforms

Each breaking version bump includes migration code:

```typescript
// communication-layer/migrations/1.x-to-2.0.ts
export const migration_1_to_2: Migration = {
  from: "^1.0.0",
  to: "2.0.0",
  transforms: [
    {
      target: "config.json",
      apply: (config) => ({
        ...config,
        communicationLayerVersion: "^2.0.0",
        // Add new required field introduced in v2
        groundingMode: "strict"
      })
    },
    {
      target: "CLAUDE.md",
      apply: (content) => {
        // Update frontmatter
        return content.replace(
          /protocolVersion: 1\.\d+\.\d+/,
          "protocolVersion: 2.0.0"
        );
      }
    },
    {
      target: "custom-prompts/*.md",
      apply: (content) => {
        // Add new required section to prompt templates
        return content + "\n\n## Reasoning\nExplain your answer step by step.";
      }
    }
  ],
  manualSteps: [
    "Review new 'reasoning' field in responses",
    "Update any custom validation logic",
    "Test with production queries"
  ]
};
```

---

## Version Compatibility

### SDK Adapter Compatibility Matrix

SDK Adapter maintains compatibility with multiple protocol versions:

```typescript
class ClaudeAdapter {
  private protocolHandlers: Map<string, ProtocolHandler> = new Map([
    ["1.x", new ProtocolV1Handler()],
    ["2.x", new ProtocolV2Handler()],
  ]);

  async query(navigator: Navigator, question: string) {
    const navigatorVersion = navigator.config.communicationLayerVersion;
    const handler = this.getCompatibleHandler(navigatorVersion);

    if (!handler) {
      throw new VersionMismatchError(
        `No compatible handler for protocol ${navigatorVersion}. ` +
        `Run 'nav-upgrade migrate' to update.`
      );
    }

    return handler.execute(navigator, question);
  }
}
```

### Deprecation Policy

When introducing breaking changes:

1. **Announce deprecation** (e.g., in v1.5.0):
   - Add deprecation warnings to SDK Adapter
   - Document migration path
   - Provide timeline (e.g., "v1.x support ends 6 months after v2.0 release")

2. **Release new version** (v2.0.0):
   - SDK Adapter supports both v1.x and v2.x
   - `nav-upgrade` tool available
   - Migration guide published

3. **Grace period** (6 months):
   - Both versions work
   - Warnings encourage migration
   - Analytics track adoption rate

4. **Drop old version** (v3.0.0):
   - Remove v1.x handler from SDK Adapter
   - Error message points to archived v2.x adapter if needed

---

## Keeping Breaking Changes Rare

### Design for Extension

1. **Use optional fields**: New features start as optional
2. **Metadata escape hatch**: `metadata?: Record<string, unknown>` allows future extensions
3. **Prompt template composition**: Add new templates without changing existing ones
4. **Backward-compatible schemas**: Additive changes only

### When Breaking Changes Are Justified

Only break compatibility for:
- **Security issues**: Fixing vulnerabilities in protocol
- **Major architectural shifts**: E.g., moving from REST to gRPC (unlikely)
- **Unsustainable tech debt**: When v1 design blocks critical features

**Example - Good reasons to break**:
- v1 stores sources as strings, v2 needs structured `Source` objects for better validation
- v1 prompt format allows hallucinations, v2 requires strict grounding

**Example - Bad reasons to break**:
- "Would be cleaner to rename this field"
- "I prefer a different schema structure"
- "Adding a convenience feature"

---

## Version Checking in MVP

### Phase 1 (Tomorrow)

**Minimum viable versioning**:
1. ✅ Add `version` field to all schemas
2. ✅ Add `communicationLayerVersion` to config.json
3. ✅ Add version frontmatter to CLAUDE.md template
4. ✅ SDK Adapter logs warning on version mismatch (doesn't block)
5. ✅ Document versioning strategy (this file)

**Don't build yet**:
- ❌ Full compatibility matrix
- ❌ Migration tool
- ❌ Multi-version handlers

### Phase 2-3 (Weeks 2-4)

When building Watcher + multi-navigator:
- Enforce version checks (block on incompatibility)
- Build `nav-upgrade check` command
- Test version negotiation

### Phase 4 (Month 2)

Production hardening:
- Build `nav-upgrade migrate` with transforms
- Add deprecation warnings
- Create migration testing framework

---

## File Formats

### config.json Schema
```json
{
  "$schema": "https://platform-ai.dev/schemas/navigator-config.v1.json",
  "version": "1.0.0",
  "name": "platform-navigator",
  "description": "Platform engineering knowledge navigator",
  "communicationLayerVersion": "^1.0.0",
  "sdkAdapterVersion": "^1.0.0",
  "createdAt": "2025-11-11T00:00:00Z",
  "updatedAt": "2025-11-11T00:00:00Z"
}
```

### CLAUDE.md Frontmatter
```markdown
---
version: 1.0.0
protocolVersion: 1.0.0
lastUpdated: 2025-11-11
---

# Platform Navigator

You are a platform engineering knowledge navigator...
```

---

## Testing Strategy

### Version Compatibility Tests

```typescript
describe("Version Compatibility", () => {
  test("SDK Adapter v2 can load v1 navigator", async () => {
    const nav = await adapter.loadNavigator("./fixtures/navigator-v1");
    expect(nav).toBeDefined();
    // Should use v1 protocol handler
  });

  test("SDK Adapter rejects incompatible versions", async () => {
    await expect(
      adapter.loadNavigator("./fixtures/navigator-v0.5")
    ).rejects.toThrow(VersionMismatchError);
  });

  test("Migration transforms v1 → v2 correctly", async () => {
    const migrated = await migrate("./fixtures/navigator-v1", "2.0.0");
    expect(migrated.config.communicationLayerVersion).toBe("^2.0.0");
    expect(migrated.config.groundingMode).toBe("strict");
  });
});
```

---

## Documentation Requirements

When releasing a new version:

1. **CHANGELOG.md**: Document all changes (breaking, features, fixes)
2. **MIGRATION.md**: Step-by-step upgrade guide with examples
3. **Version support matrix**: What versions are compatible
4. **Deprecation timeline**: When old versions will stop working

---

## Summary

**Philosophy**: Version everything from day 1. Make breaking changes rare. When they happen, provide automated migration.

**MVP Scope (Tomorrow)**: Add version fields, document strategy, log warnings

**Future Scope (Phases 2-4)**: Build `nav-upgrade` tool, enforce compatibility, test migrations

**Key Files**:
- `communication-layer/PROTOCOL_VERSION` - Current protocol version
- `navigator-framework/migrations/` - Migration transforms
- `navigator-framework/cli/upgrade.ts` - Upgrade tool
