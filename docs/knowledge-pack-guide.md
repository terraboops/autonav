# Knowledge Pack Creator's Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-17

## Table of Contents

- [Introduction](#introduction)
- [What is a Knowledge Pack?](#what-is-a-knowledge-pack)
- [When to Create a Pack](#when-to-create-a-pack)
- [Quick Start](#quick-start)
- [Pack Structure](#pack-structure)
- [Writing system-configuration.md](#writing-system-configurationmd)
- [Organizing Knowledge](#organizing-knowledge)
- [Best Practices](#best-practices)
- [Packaging and Distribution](#packaging-and-distribution)
- [Testing Your Pack](#testing-your-pack)
- [Version Management](#version-management)
- [Examples](#examples)

---

## Introduction

This guide teaches you how to create, package, and distribute knowledge packs for Autonav. Knowledge packs enable anyone to create specialized navigators without central coordination.

**Who this guide is for:**
- Platform engineers curating team documentation
- Technical writers organizing knowledge bases
- DevOps teams sharing runbooks
- Anyone building domain-specific AI navigators

**What you'll learn:**
- How to structure a knowledge pack
- How to write effective system-configuration.md
- How to organize knowledge for AI search
- How to package and distribute your pack

---

## What is a Knowledge Pack?

A knowledge pack is a curated collection of:
- **Markdown documentation** (your knowledge base)
- **System configuration** (instructions for the AI navigator)
- **Metadata** (version, description, author)

**Example use cases:**
- Platform engineering documentation (Kubernetes, AWS, monitoring)
- API documentation with examples
- Troubleshooting runbooks
- Product documentation
- Internal tools and processes

**Why knowledge packs?**
- **Decentralized:** Anyone can create and host packs
- **Git-friendly:** Plain text, versionable, reviewable
- **Self-contained:** No external dependencies
- **AI-optimized:** Structured for agentic search

---

## When to Create a Pack

Create a knowledge pack when you have:

✅ **Curated documentation** that answers common questions
✅ **Domain-specific knowledge** (platform, product, tools)
✅ **Repeatable questions** from team members or users
✅ **Markdown or text files** (or can convert to markdown)

Don't create a pack if:

❌ Knowledge is constantly changing (use live docs instead)
❌ Content is proprietary and can't be shared (use private hosting)
❌ You only have 1-2 pages of docs (not worth the overhead)

---

## Quick Start

### Step 1: Create Pack Directory

```bash
mkdir my-pack
cd my-pack
```

### Step 2: Create metadata.json

```json
{
  "$schema": "https://platform-ai.dev/schemas/knowledge-pack-metadata/1.0.0",
  "name": "my-pack",
  "version": "1.0.0",
  "description": "My awesome knowledge pack for [domain]",
  "author": "Your Name",
  "updated": "2025-11-17T00:00:00Z",
  "autonav_version": ">=0.1.0",
  "tags": ["your", "tags", "here"]
}
```

### Step 3: Create system-configuration.md

```markdown
# My Pack - System Configuration

## Domain Scope
This navigator specializes in [domain] questions including:
- Topic 1
- Topic 2
- Topic 3

## Knowledge Base Organization
- `guide.md` - Getting started guide
- `reference.md` - Complete reference documentation
- `troubleshooting.md` - Common issues and solutions

## Response Guidelines
- Always cite specific files
- Include working examples
- Mention prerequisites
```

### Step 4: Add Knowledge Files

```bash
mkdir knowledge
echo "# Getting Started" > knowledge/guide.md
echo "# Reference" > knowledge/reference.md
echo "# Troubleshooting" > knowledge/troubleshooting.md
```

### Step 5: Package

```bash
cd ..
tar -czf my-pack-1.0.0.tar.gz my-pack/
```

**Done!** You now have a knowledge pack tarball ready for distribution.

---

## Pack Structure

### Required Files

```
my-pack/
├── metadata.json              # REQUIRED: Pack metadata
├── system-configuration.md    # REQUIRED: AI configuration
└── knowledge/                 # REQUIRED: Knowledge base
    ├── *.md                  # Your documentation
    └── ...
```

### Optional Files

```
my-pack/
├── README.md                  # Human-readable overview
├── .claude/
│   └── plugins.json          # Claude plugin defaults (future)
└── knowledge/
    ├── images/               # Images referenced in docs
    └── examples/             # Code examples
```

### File Requirements

**metadata.json:**
- Must be valid JSON
- Must include: `name`, `version`, `description`, `updated`
- Version must be semantic (e.g., `1.0.0`)

**system-configuration.md:**
- Must be valid markdown
- Should include: domain scope, knowledge organization, response guidelines

**knowledge/:**
- Must contain at least one file
- Files should be text-based (markdown recommended)
- Subdirectories allowed

---

## Writing system-configuration.md

This file is **critical** - it tells the AI navigator how to use your knowledge base.

### Template

```markdown
# {Pack Name} - System Configuration

## Domain Scope

[What questions can this navigator answer?]

This navigator specializes in [domain] questions including:
- [Topic area 1]
- [Topic area 2]
- [Topic area 3]

## Knowledge Base Organization

[How are files organized?]

- `file1.md` - [Description of contents]
- `file2.md` - [Description of contents]
- `directory/` - [Description of contents]

## Key Concepts and Terminology

[Domain-specific terms the AI should know]

**Term 1**: Definition
**Term 2**: Definition

## Response Guidelines

[How should the AI structure answers?]

1. **Always cite sources**: Reference specific files for all claims
2. **Include examples**: Show working code/commands, not pseudocode
3. **Mention prerequisites**: State required tools, access, configuration
4. **Link related topics**: Reference other relevant docs

## Out of Scope

[What this navigator does NOT cover]

This navigator does NOT cover:
- [Topic outside scope]
- [Topic outside scope]

If asked about these topics, respond: "This is outside my domain expertise..."
```

### Sections Explained

#### Domain Scope

**Purpose:** Define what questions the navigator can answer

**Good example:**
```markdown
## Domain Scope

This navigator specializes in AWS deployment questions including:
- EC2 instance management
- S3 bucket configuration
- IAM role setup
- CloudFormation templates
```

**Bad example:**
```markdown
## Domain Scope

This navigator knows about AWS.
```

❌ Too vague - doesn't specify what AWS topics are covered

#### Knowledge Base Organization

**Purpose:** Help the AI understand file structure

**Good example:**
```markdown
## Knowledge Base Organization

- `ec2/instances.md` - EC2 instance types, pricing, and best practices
- `ec2/security-groups.md` - Security group configuration and rules
- `s3/buckets.md` - S3 bucket creation, policies, and lifecycle rules
- `iam/roles.md` - IAM role setup for common use cases
```

**Bad example:**
```markdown
## Knowledge Base Organization

We have docs about EC2, S3, and IAM.
```

❌ Doesn't explain where information is located

#### Response Guidelines

**Purpose:** Define how answers should be structured

**Good example:**
```markdown
## Response Guidelines

1. **Always cite sources**: Reference specific files (e.g., "see ec2/instances.md, section 'Instance Types'")
2. **Show working examples**: Use actual AWS CLI commands, not placeholders
3. **Include safety checks**: For destructive commands, mention --dry-run and backups
4. **State prerequisites**: AWS CLI version, required IAM permissions
```

**Bad example:**
```markdown
## Response Guidelines

Be helpful and accurate.
```

❌ Too generic - doesn't provide specific guidance

#### Out of Scope

**Purpose:** Prevent hallucinations about topics not covered

**Good example:**
```markdown
## Out of Scope

This navigator does NOT cover:
- Application code (only infrastructure)
- Database query optimization (only RDS setup)
- Networking beyond VPC basics

If asked about these, respond: "This is outside my domain. For [topic], see [alternative resource]."
```

**Why this matters:** Prevents the AI from making up answers about topics you don't document.

---

## Organizing Knowledge

### Directory Structure

**Organize by topic:**
```
knowledge/
├── getting-started/
│   └── quickstart.md
├── deployment/
│   ├── kubernetes.md
│   ├── docker.md
│   └── troubleshooting.md
├── monitoring/
│   ├── prometheus.md
│   └── grafana.md
└── reference/
    └── api.md
```

**Organize by task:**
```
knowledge/
├── how-to/
│   ├── deploy-app.md
│   ├── setup-monitoring.md
│   └── troubleshoot-errors.md
├── concepts/
│   ├── architecture.md
│   └── glossary.md
└── reference/
    ├── commands.md
    └── configuration.md
```

**Choose organization that matches how users think about the domain.**

### File Naming

✅ **Good:**
- `kubernetes-deployment.md`
- `prometheus-alerts.md`
- `troubleshooting-guide.md`

❌ **Bad:**
- `doc1.md` (not descriptive)
- `KubernetesDeployment.md` (use lowercase with hyphens)
- `k8s_deploy_final_v2.md` (avoid versions in filename)

### Writing Effective Documentation

#### Use Clear Headings

```markdown
# Main Topic

## Subtopic 1

### Specific Detail

#### Fine Detail
```

**Why:** Helps AI understand document structure and find relevant sections

#### Include Working Examples

✅ **Good:**
```markdown
## Deploy to Kubernetes

```bash
kubectl apply -f deployment.yaml
kubectl rollout status deployment/my-app
kubectl get pods -l app=my-app
```
```

❌ **Bad:**
```markdown
## Deploy to Kubernetes

Use kubectl to deploy your application.
```

#### Show Expected Output

```markdown
## Check Pod Status

```bash
kubectl get pods

# Expected output:
NAME                     READY   STATUS    RESTARTS   AGE
my-app-7d8f9c8b-xyz12   1/1     Running   0          5m
```
```

#### Document Prerequisites

```markdown
## Prerequisites

- kubectl 1.28+ installed
- Access to Kubernetes cluster
- Valid kubeconfig file
- Docker image pushed to registry
```

#### Link Related Documentation

```markdown
For more details on monitoring, see [prometheus.md](../monitoring/prometheus.md).
```

---

## Best Practices

### Content Guidelines

1. **One topic per file:** Keep files focused
2. **Use markdown:** Easy to read and AI-friendly
3. **Include examples:** Working code, not pseudocode
4. **Update dates:** Add "Last Updated: YYYY-MM-DD"
5. **Cross-reference:** Link related docs

### Avoid Hallucinations

The AI will hallucinate if docs are vague. Prevent this:

✅ **Do:**
- Cite exact command syntax
- Show actual file paths
- Include real example values
- Document what's NOT supported

❌ **Don't:**
- Use placeholder values without explanation
- Reference files that don't exist
- Make claims without evidence in docs

### Metadata Best Practices

```json
{
  "name": "platform-engineering",           // lowercase-with-hyphens
  "version": "1.0.0",                       // semantic versioning
  "description": "Platform engineering...", // specific, not vague
  "author": "Platform Team",                // team or person
  "homepage": "https://github.com/...",     // where to learn more
  "updated": "2025-11-17T00:00:00Z",       // ISO 8601 format
  "autonav_version": ">=0.1.0",            // version compatibility
  "tags": ["platform", "kubernetes"],       // 3-5 relevant tags
  "keywords": ["deploy", "k8s", "aws"]      // search keywords
}
```

### Versioning Strategy

**When to bump version:**

- **Patch (1.0.0 → 1.0.1):** Typo fixes, clarifications, small updates
- **Minor (1.0.1 → 1.1.0):** New documentation, expanded coverage
- **Major (1.1.0 → 2.0.0):** Breaking changes, removed content, restructuring

**Update `updated` field** in metadata.json whenever you make changes.

---

## Packaging and Distribution

### Create Tarball

```bash
# From parent directory
tar -czf my-pack-1.0.0.tar.gz my-pack/

# Verify contents
tar -tzf my-pack-1.0.0.tar.gz
```

### Hosting Options

#### Option 1: Simple HTTP Server

```bash
# Serve from any web server
python3 -m http.server 8000

# Access at:
# http://localhost:8000/my-pack-1.0.0.tar.gz
```

#### Option 2: Reference Server

Use the knowledge-pack-server package:

```bash
npm install -g @platform-ai/knowledge-pack-server

# Create packs directory
mkdir -p packs/my-pack/1.0.0
cp my-pack-1.0.0.tar.gz packs/my-pack/1.0.0/
cp my-pack/metadata.json packs/my-pack/1.0.0/

# Start server
pack-server --packs-dir packs
```

#### Option 3: Static Hosting

Upload to S3, GitHub Pages, Netlify, etc.:

```bash
# S3 example
aws s3 cp my-pack-1.0.0.tar.gz s3://my-bucket/packs/my-pack/1.0.0/
aws s3 cp metadata.json s3://my-bucket/packs/my-pack/1.0.0/
```

### Distribution Endpoints

Your server should support:

```
GET /packs/my-pack/latest          # Latest version
GET /packs/my-pack/versions        # List all versions
GET /packs/my-pack/1.0.0          # Specific version
```

See [KNOWLEDGE_PACK_PROTOCOL.md](KNOWLEDGE_PACK_PROTOCOL.md) for full specification.

---

## Testing Your Pack

### Test Locally

```bash
# Extract pack
tar -xzf my-pack-1.0.0.tar.gz
cd my-pack

# Query with Autonav
export ANTHROPIC_API_KEY=your-api-key
nav-query . "Your test question"
```

### Test Questions

Create a test suite of questions you know the pack should answer:

```bash
# test-questions.txt
How do I deploy to Kubernetes?
What are the troubleshooting steps for pod errors?
How do I set up Prometheus monitoring?
```

```bash
# Run tests
while read -r question; do
  echo "Q: $question"
  nav-query . "$question" | jq -r '.answer'
  echo "---"
done < test-questions.txt
```

### Validation Checklist

- [ ] Pack extracts without errors
- [ ] metadata.json is valid JSON
- [ ] system-configuration.md has all sections
- [ ] Knowledge files are readable markdown
- [ ] Test questions get accurate answers
- [ ] Sources are cited correctly
- [ ] No hallucinated file paths or commands

---

## Version Management

### Creating a New Version

```bash
# 1. Update files in knowledge/
vim knowledge/deployment.md

# 2. Update metadata.json
# - Increment version: 1.0.0 → 1.1.0
# - Update "updated" timestamp

# 3. Package new version
tar -czf my-pack-1.1.0.tar.gz my-pack/

# 4. Deploy to server
cp my-pack-1.1.0.tar.gz packs/my-pack/1.1.0/
cp my-pack/metadata.json packs/my-pack/1.1.0/
```

### Changelog

Maintain a CHANGELOG.md:

```markdown
# Changelog

## 1.1.0 (2025-11-20)

### Added
- New troubleshooting guide for database errors
- Expanded Kubernetes deployment examples

### Changed
- Updated Prometheus guide with recording rules

### Fixed
- Corrected kubectl command syntax in deployment guide

## 1.0.0 (2025-11-17)

Initial release
```

---

## Examples

### Example 1: API Documentation Pack

```
api-docs-pack/
├── metadata.json
├── system-configuration.md
├── README.md
└── knowledge/
    ├── authentication.md    # OAuth, API keys
    ├── endpoints.md        # API endpoints with examples
    ├── rate-limits.md      # Rate limiting policies
    ├── errors.md           # Error codes and handling
    └── examples/
        ├── curl.md         # curl examples
        └── python.md       # Python SDK examples
```

### Example 2: DevOps Runbooks Pack

```
devops-runbooks/
├── metadata.json
├── system-configuration.md
└── knowledge/
    ├── incidents/
    │   ├── database-outage.md
    │   ├── high-latency.md
    │   └── deployment-rollback.md
    ├── maintenance/
    │   ├── database-backup.md
    │   ├── certificate-renewal.md
    │   └── log-rotation.md
    └── monitoring/
        ├── alert-descriptions.md
        └── dashboard-guide.md
```

### Example 3: Product Documentation Pack

```
product-docs/
├── metadata.json
├── system-configuration.md
└── knowledge/
    ├── getting-started.md
    ├── features/
    │   ├── feature-a.md
    │   ├── feature-b.md
    │   └── feature-c.md
    ├── how-to/
    │   ├── task-1.md
    │   ├── task-2.md
    │   └── task-3.md
    └── troubleshooting.md
```

---

## Summary

**Creating a knowledge pack:**
1. Organize your markdown documentation
2. Write metadata.json
3. Write system-configuration.md
4. Package as tarball
5. Host on any HTTP server

**Key principles:**
- **Curate, don't generate:** Humans write docs, AI organizes them
- **Be specific:** Vague docs lead to hallucinations
- **Test thoroughly:** Verify answers before distributing
- **Version everything:** Use semantic versioning

**Next steps:**
- Read the [Knowledge Pack Protocol](KNOWLEDGE_PACK_PROTOCOL.md)
- Check out [example packs](../examples/knowledge-packs/)
- Set up a [reference server](../packages/knowledge-pack-server/)

---

## Resources

- **Protocol Specification:** [KNOWLEDGE_PACK_PROTOCOL.md](KNOWLEDGE_PACK_PROTOCOL.md)
- **Reference Server:** [packages/knowledge-pack-server](../packages/knowledge-pack-server/)
- **Example Pack:** [examples/knowledge-packs/platform-engineering](../examples/knowledge-packs/platform-engineering/)
- **Autonav CLI:** [packages/autonav](../packages/autonav/)

## Support

- **GitHub Issues:** [platform-ai/issues](https://github.com/terraboops/platform-ai/issues)
- **Documentation:** [Platform AI Docs](https://github.com/terraboops/platform-ai)

---

**Happy pack creating!** 🚀
