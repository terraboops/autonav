# Navigator Directory Structure Protocol

## Overview

This document defines the canonical directory structure for Autonav navigators. Any directory following this structure becomes an autonomous, queryable knowledge navigator.

## Core Principle

**Navigator-as-Directory**: A navigator is a self-contained directory with configuration, instructions, and knowledge that can be version-controlled, shared, and deployed independently.

## Required Structure

```
navigator/
├── config.json              # Required - navigator configuration
├── CLAUDE.md               # Required - grounding rules and instructions
├── knowledge/              # Required - knowledge base directory
│   ├── *.md               # Markdown knowledge files
│   ├── *.txt              # Text documentation
│   └── **/*               # Any file type (md, json, yaml, etc.)
├── .claude/               # Required - Claude Code configuration
│   └── plugins.json       # Plugin configuration
└── .gitignore            # Recommended
```

## Optional Structure

```
navigator/
├── system-configuration.md  # Optional - from knowledge pack
├── knowledge-pack.json      # Optional - if installed from a pack
├── .env                     # Optional - environment-specific settings
└── README.md               # Recommended - navigator documentation
```

## File Specifications

### config.json (Required)

Navigator configuration metadata. Must conform to `NavigatorConfigSchema`.

**Minimum required fields**:
```json
{
  "version": "1.0.0",
  "name": "platform-engineering-navigator",
  "created": "2024-01-15T10:00:00Z",
  "knowledgePack": null,
  "knowledgeBase": "knowledge",
  "plugins": {
    "configFile": ".claude/plugins.json"
  }
}
```

**With knowledge pack**:
```json
{
  "version": "1.0.0",
  "name": "kubernetes-navigator",
  "description": "Navigator for Kubernetes operations and troubleshooting",
  "created": "2024-01-15T10:00:00Z",
  "knowledgePack": {
    "name": "kubernetes-ops-pack",
    "version": "2.0.1",
    "installedAt": "2024-01-15T10:00:00Z"
  },
  "knowledgeBase": "knowledge",
  "systemConfiguration": "system-configuration.md",
  "plugins": {
    "configFile": ".claude/plugins.json"
  }
}
```

### CLAUDE.md (Required)

Grounding rules and instructions for the navigator. Must include:

1. **Navigator identity**: What this navigator knows about
2. **Grounding rules**: How to answer questions
3. **Response format**: Structured output schema
4. **Source citation rules**: How to cite sources
5. **Confidence levels**: How to assess confidence
6. **Out-of-domain detection**: How to recognize out-of-scope questions
7. **Examples**: Good and bad responses

See `templates/generators/claude-md.ts` for the canonical template generator.

### knowledge/ (Required)

The knowledge base directory containing all documents the navigator can search.

**Rules**:
- Can contain any file type (`.md`, `.txt`, `.json`, `.yaml`, etc.)
- Can use subdirectories for organization
- All files should be UTF-8 encoded
- Recommended to use Markdown for rich documentation
- Files should be self-contained (avoid external references)

**Example organization**:
```
knowledge/
├── README.md              # Overview of knowledge base
├── deployment/
│   ├── aws-deployment.md
│   ├── kubernetes-deployment.md
│   └── terraform-setup.md
├── troubleshooting/
│   ├── common-errors.md
│   ├── debugging-guide.md
│   └── incident-response.md
└── reference/
    ├── api-endpoints.md
    ├── configuration-options.md
    └── architecture-diagrams.md
```

### .claude/plugins.json (Required)

Plugin configuration for Slack, Signal, and other integrations. Must conform to `PluginConfigSchema`.

**Minimum structure**:
```json
{
  "slack": {
    "enabled": false,
    "workspace": "",
    "channels": [],
    "threadNotifications": true
  },
  "signal": {
    "enabled": false,
    "phoneNumber": "",
    "checkInSchedule": "0 9 * * *",
    "notificationTypes": ["urgent"]
  }
}
```

### system-configuration.md (Optional)

Domain-specific instructions provided by a knowledge pack. If present, CLAUDE.md should reference this file.

Example content:
```markdown
# System Configuration: Kubernetes Ops Pack

## Domain Scope
This navigator specializes in Kubernetes operations, troubleshooting, and best practices.

## Question Categories
1. **Deployment**: How to deploy applications to Kubernetes
2. **Troubleshooting**: Debugging pods, services, ingresses
3. **Scaling**: HPA, VPA, cluster autoscaling
4. **Security**: RBAC, network policies, pod security

## Out of Domain
- Cloud provider-specific features (unless documented in knowledge base)
- Application code debugging
- Database administration
```

## Validation Rules

A valid navigator directory must:

1. ✅ Contain `config.json` with valid NavigatorConfigSchema
2. ✅ Contain `CLAUDE.md` with grounding rules
3. ✅ Contain `knowledge/` directory (even if empty)
4. ✅ Contain `.claude/plugins.json` with valid PluginConfigSchema
5. ✅ All file paths in config must exist
6. ✅ `knowledgeBase` path must point to an existing directory
7. ✅ If `systemConfiguration` is specified, file must exist

## Discovery Protocol

Tools can discover navigators by:

1. **Scanning for `config.json`**: Any directory with a valid `config.json` is a potential navigator
2. **Checking required files**: Validate CLAUDE.md and .claude/plugins.json exist
3. **Schema validation**: Parse config.json and validate against NavigatorConfigSchema
4. **Knowledge base check**: Verify knowledgeBase directory exists and is readable

## Version Compatibility

Navigators declare compatibility with:
- **Config version**: Semantic versioning of the config.json schema
- **Knowledge pack version**: If using a knowledge pack, the pack's version
- **Protocol version**: Implied by the structure (v1.0.0 for this spec)

## Git Integration

Navigators are designed to be version-controlled:

```gitignore
# Recommended .gitignore
.env
*.log
.DS_Store
.claude/cache/
```

**What to commit**:
- ✅ config.json
- ✅ CLAUDE.md
- ✅ knowledge/
- ✅ .claude/plugins.json (with sensitive values removed)
- ✅ system-configuration.md (if present)

**What NOT to commit**:
- ❌ .env (environment-specific secrets)
- ❌ .claude/cache/ (runtime cache)
- ❌ *.log (logs)

## Deployment Models

### Standalone Navigator
```
my-navigator/
├── config.json
├── CLAUDE.md
├── knowledge/
│   └── ... (custom docs)
└── .claude/
    └── plugins.json
```

### Knowledge Pack Navigator
```
platform-navigator/
├── config.json              # References knowledge pack
├── CLAUDE.md               # Generated from pack
├── system-configuration.md  # From pack
├── knowledge/              # From pack
└── .claude/
    └── plugins.json        # Custom configuration
```

### Multi-Navigator Workspace
```
navigators/
├── kubernetes-nav/
│   ├── config.json
│   ├── CLAUDE.md
│   └── knowledge/
├── terraform-nav/
│   ├── config.json
│   ├── CLAUDE.md
│   └── knowledge/
└── aws-nav/
    ├── config.json
    ├── CLAUDE.md
    └── knowledge/
```

## Future Extensions

This protocol is versioned and may be extended with:

- **Navigator dependencies**: Reference other navigators for cross-domain queries
- **Knowledge pack updates**: Hot-reload knowledge without recreating navigators
- **Plugin ecosystem**: Third-party plugins beyond Slack and Signal
- **Multi-language support**: Knowledge bases in multiple languages
- **Knowledge base indexing**: Metadata for faster search

---

**Version**: 1.0.0
**Last Updated**: 2024-01-15
**Status**: Stable
