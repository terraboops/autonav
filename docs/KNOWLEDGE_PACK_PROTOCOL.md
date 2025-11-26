# Knowledge Pack Protocol Specification

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2025-11-17

## Table of Contents

- [Overview](#overview)
- [Design Principles](#design-principles)
- [HTTP API Specification](#http-api-specification)
- [Pack Format](#pack-format)
- [Metadata Schema](#metadata-schema)
- [Versioning](#versioning)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)
- [Examples](#examples)
- [Implementation Guide](#implementation-guide)

---

## Overview

The Knowledge Pack Protocol defines a standard HTTP-based distribution mechanism for Autonav knowledge packs. It enables decentralized creation and hosting of specialized navigators without requiring central package registry coordination.

### Key Features

- **HTTP-based**: Simple GET requests, works with any web server
- **Decentralized**: Anyone can create and host packs
- **Versioned**: Semantic versioning with explicit version queries
- **Minimal**: No authentication, database, or complex infrastructure required
- **Git-friendly**: Plain text/markdown content, easy to version control

### Philosophy

Knowledge packs are community-curated configuration files + markdown that enable anyone to create specialized navigators. The protocol prioritizes simplicity and accessibility over features.

---

## Design Principles

1. **Simple over clever**: Use standard HTTP, avoid custom protocols
2. **Decentralized by default**: No central authority required
3. **Easy to implement**: Reference server in <200 lines of code
4. **Version-first**: Everything is versioned from day one
5. **Git-native**: Content should work well with version control
6. **Extensible**: Metadata supports future additions

---

## HTTP API Specification

### Base URL

All endpoints are relative to a base URL chosen by the pack host:

```
https://example.com/knowledge-packs/
```

### Endpoints

#### 1. Get Latest Version

```http
GET /packs/{pack-name}/latest
```

Returns the latest version of the specified pack as a tarball archive.

**Parameters:**
- `pack-name` (path): Name of the pack (alphanumeric, hyphens, underscores)

**Response:**
- **Status:** 200 OK
- **Content-Type:** `application/gzip` or `application/x-tar+gzip`
- **Headers:**
  - `Content-Disposition: attachment; filename="{pack-name}-{version}.tar.gz"`
  - `X-Pack-Version: {version}` (semantic version)
  - `X-Pack-Name: {pack-name}`
- **Body:** Gzipped tarball of the pack contents

**Example:**
```bash
curl -L https://example.com/packs/platform-engineering/latest \
  -o platform-engineering.tar.gz
```

#### 2. List Available Versions

```http
GET /packs/{pack-name}/versions
```

Returns JSON array of available versions with metadata.

**Parameters:**
- `pack-name` (path): Name of the pack

**Response:**
- **Status:** 200 OK
- **Content-Type:** `application/json`
- **Body:**
```json
{
  "pack": "platform-engineering",
  "versions": [
    {
      "version": "1.2.0",
      "released": "2025-11-17T10:00:00Z",
      "size": 45632,
      "autonav_version": ">=0.1.0",
      "description": "Added troubleshooting guides for Kubernetes"
    },
    {
      "version": "1.1.0",
      "released": "2025-11-15T14:30:00Z",
      "size": 42108,
      "autonav_version": ">=0.1.0",
      "description": "Updated monitoring documentation"
    },
    {
      "version": "1.0.0",
      "released": "2025-11-10T08:00:00Z",
      "size": 38945,
      "autonav_version": ">=0.1.0",
      "description": "Initial release"
    }
  ]
}
```

**Example:**
```bash
curl https://example.com/packs/platform-engineering/versions
```

#### 3. Get Specific Version

```http
GET /packs/{pack-name}/{version}
```

Returns a specific version of the pack as a tarball archive.

**Parameters:**
- `pack-name` (path): Name of the pack
- `version` (path): Semantic version (e.g., `1.0.0`, `2.1.3`)

**Response:**
- **Status:** 200 OK
- **Content-Type:** `application/gzip` or `application/x-tar+gzip`
- **Headers:**
  - `Content-Disposition: attachment; filename="{pack-name}-{version}.tar.gz"`
  - `X-Pack-Version: {version}`
  - `X-Pack-Name: {pack-name}`
- **Body:** Gzipped tarball of the pack contents

**Example:**
```bash
curl -L https://example.com/packs/platform-engineering/1.0.0 \
  -o platform-engineering-1.0.0.tar.gz
```

#### 4. Get Pack Metadata (Optional)

```http
GET /packs/{pack-name}/metadata
```

Returns metadata for the latest version without downloading the full pack.

**Response:**
- **Status:** 200 OK
- **Content-Type:** `application/json`
- **Body:** Pack metadata JSON (see [Metadata Schema](#metadata-schema))

**Example:**
```bash
curl https://example.com/packs/platform-engineering/metadata
```

---

## Pack Format

### Archive Format

Packs are distributed as **gzipped tarballs** (`.tar.gz`).

**Rationale:**
- Standard on Unix/Linux systems
- Excellent compression
- Preserves file permissions and symlinks
- Git-friendly (can extract, edit, re-package easily)
- Wide tooling support (tar, curl, wget)

**Alternatives considered:**
- ZIP: More universal but less standard in Unix tooling
- Directory cloning: Requires git, less portable

### Directory Structure

When extracted, a pack must have this structure:

```
{pack-name}/
├── metadata.json              # REQUIRED: Pack metadata
├── system-configuration.md    # REQUIRED: Domain-specific instructions
├── knowledge/                 # REQUIRED: Knowledge base files
│   ├── *.md                  # Markdown documentation
│   └── ...
└── .claude/                   # OPTIONAL: Claude configuration
    └── plugins.json          # Plugin defaults
```

#### Required Files

##### 1. `metadata.json`

Pack metadata and version information. See [Metadata Schema](#metadata-schema).

##### 2. `system-configuration.md`

Domain-specific system instructions injected into the navigator's context. See [System Configuration Specification](#system-configuration-specification).

##### 3. `knowledge/` directory

Contains all knowledge base files (markdown, text, etc.) that the navigator can search.

**Requirements:**
- Must contain at least one file
- All files must be text-based (markdown recommended)
- Subdirectories allowed for organization
- File names should be descriptive

**Example:**
```
knowledge/
├── README.md                 # Overview of knowledge base
├── deployment/
│   ├── kubernetes.md
│   ├── aws.md
│   └── troubleshooting.md
├── monitoring/
│   ├── prometheus.md
│   ├── grafana.md
│   └── alerts.md
└── architecture/
    ├── overview.md
    └── decisions.md
```

#### Optional Files

##### `.claude/plugins.json`

Default plugin configuration for Claude Code (future feature).

---

## Metadata Schema

The `metadata.json` file contains pack information and version metadata.

### Schema Definition

```json
{
  "$schema": "https://platform-ai.dev/schemas/knowledge-pack-metadata/1.0.0",
  "name": "string (required)",
  "version": "string (required, semver)",
  "description": "string (required)",
  "author": "string (optional)",
  "homepage": "string (optional, URL)",
  "repository": "string (optional, URL)",
  "license": "string (optional, SPDX identifier)",
  "created": "string (optional, ISO 8601 datetime)",
  "updated": "string (required, ISO 8601 datetime)",
  "autonav_version": "string (optional, semver range)",
  "tags": ["string", "..."],
  "keywords": ["string", "..."]
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Pack name (alphanumeric, hyphens, underscores). Must match directory name. |
| `version` | string | Yes | Semantic version (e.g., `1.0.0`) |
| `description` | string | Yes | One-sentence description of the pack's purpose |
| `author` | string | No | Author name or organization |
| `homepage` | string | No | Pack's homepage URL |
| `repository` | string | No | Source repository URL (e.g., GitHub) |
| `license` | string | No | License identifier (e.g., `MIT`, `Apache-2.0`) |
| `created` | string | No | ISO 8601 datetime when pack was first created |
| `updated` | string | Yes | ISO 8601 datetime of last update |
| `autonav_version` | string | No | Compatible Autonav version range (e.g., `>=0.1.0`, `^1.0.0`) |
| `tags` | array | No | Categorical tags (e.g., `["kubernetes", "platform"]`) |
| `keywords` | array | No | Search keywords |

### Example

```json
{
  "$schema": "https://platform-ai.dev/schemas/knowledge-pack-metadata/1.0.0",
  "name": "platform-engineering",
  "version": "1.2.0",
  "description": "Platform engineering knowledge pack with deployment, monitoring, and troubleshooting guides",
  "author": "Terra",
  "homepage": "https://example.com/packs/platform-engineering",
  "repository": "https://github.com/example/platform-engineering-pack",
  "license": "MIT",
  "created": "2025-11-10T08:00:00Z",
  "updated": "2025-11-17T10:00:00Z",
  "autonav_version": ">=0.1.0",
  "tags": ["platform", "kubernetes", "monitoring", "devops"],
  "keywords": ["deployment", "observability", "troubleshooting", "k8s"]
}
```

---

## System Configuration Specification

The `system-configuration.md` file provides domain-specific instructions that are injected into the navigator's context.

### Purpose

This file defines:
- What domain the navigator specializes in
- How knowledge is organized
- Special terminology or conventions
- Citation and response guidelines

### Recommended Structure

```markdown
# {Pack Name} - System Configuration

## Domain Scope

Brief description of what questions this navigator can answer.

Examples:
- Topic area 1
- Topic area 2
- Topic area 3

## Knowledge Base Organization

Explanation of how files are organized and what each contains:
- `file1.md` - Description
- `file2.md` - Description
- `directory/` - Description

## Key Concepts and Terminology

Domain-specific terms and definitions that the navigator should know.

## Response Guidelines

Instructions for how to structure answers:
- Always cite specific files
- Include code examples when relevant
- Mention limitations or edge cases
- etc.

## Out of Scope

Explicitly state what this navigator does NOT cover to prevent hallucinations.
```

### Example

```markdown
# Platform Engineering Navigator - System Configuration

## Domain Scope

This navigator specializes in platform engineering questions including:
- Kubernetes deployment and operations
- Monitoring and observability (Prometheus, Grafana)
- Incident response and troubleshooting
- Infrastructure as Code (Terraform, Helm)
- CI/CD pipelines

## Knowledge Base Organization

- `deployment/kubernetes.md` - Kubernetes deployment procedures and best practices
- `deployment/aws.md` - AWS-specific deployment guides
- `deployment/troubleshooting.md` - Common deployment issues and solutions
- `monitoring/prometheus.md` - Prometheus setup and configuration
- `monitoring/grafana.md` - Grafana dashboards and alerts
- `architecture/overview.md` - Platform architecture decisions
- `architecture/decisions.md` - ADRs (Architecture Decision Records)

## Key Concepts and Terminology

- **Platform Engineering**: Building and maintaining internal developer platforms
- **Golden Path**: The opinionated and supported path for building and deploying applications
- **Toil**: Repetitive, automatable work that doesn't provide lasting value
- **SLO**: Service Level Objective - target level of service reliability
- **Runbook**: Step-by-step guide for responding to incidents

## Response Guidelines

1. **Always cite sources**: Reference specific files for all factual claims
2. **Include safety checks**: For deployment commands, mention rollback procedures
3. **Show working examples**: Use actual kubectl/terraform commands, not pseudocode
4. **Mention prerequisites**: State required access, tools, or configuration
5. **Link related topics**: Reference other relevant docs when appropriate

## Out of Scope

This navigator does NOT cover:
- Application-level code (only infrastructure)
- Database query optimization (only infra setup)
- Frontend development
- Product requirements or business logic
```

---

## Versioning

### Semantic Versioning

All packs use [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: Breaking changes (incompatible API changes, removed content)
- **MINOR**: New features (new documentation, expanded coverage)
- **PATCH**: Bug fixes (typos, clarifications, small updates)

### Version Compatibility

Packs should declare compatible Autonav versions using semver ranges:

```json
{
  "autonav_version": ">=0.1.0 <2.0.0"
}
```

**Common patterns:**
- `>=0.1.0` - Works with Autonav 0.1.0 and above
- `^1.0.0` - Compatible with 1.x.x (but not 2.0.0)
- `~1.2.0` - Compatible with 1.2.x (patch updates only)

### Version Discovery

Clients can discover available versions via:

```bash
curl https://example.com/packs/platform-engineering/versions
```

The `/latest` endpoint always returns the highest semantic version.

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful request |
| 404 | Not Found | Pack or version doesn't exist |
| 400 | Bad Request | Invalid pack name or version format |
| 500 | Internal Server Error | Server-side issue |
| 503 | Service Unavailable | Temporary server issue |

### Error Response Format

Error responses should be JSON:

```json
{
  "error": "Pack not found",
  "code": "PACK_NOT_FOUND",
  "message": "The pack 'nonexistent-pack' does not exist on this server",
  "pack": "nonexistent-pack"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `PACK_NOT_FOUND` | 404 | Pack name doesn't exist |
| `VERSION_NOT_FOUND` | 404 | Requested version doesn't exist |
| `INVALID_PACK_NAME` | 400 | Pack name format is invalid |
| `INVALID_VERSION` | 400 | Version format is invalid |
| `SERVER_ERROR` | 500 | Unexpected server error |

### Example Error Responses

**Pack not found:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Pack not found",
  "code": "PACK_NOT_FOUND",
  "message": "The pack 'invalid-pack' does not exist",
  "pack": "invalid-pack"
}
```

**Version not found:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Version not found",
  "code": "VERSION_NOT_FOUND",
  "message": "Version '2.0.0' not found for pack 'platform-engineering'",
  "pack": "platform-engineering",
  "version": "2.0.0",
  "availableVersions": ["1.0.0", "1.1.0", "1.2.0"]
}
```

**Invalid version format:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid version format",
  "code": "INVALID_VERSION",
  "message": "Version 'latest' is not a valid semantic version. Use /latest endpoint or specify a semantic version like '1.0.0'",
  "version": "latest"
}
```

---

## Security Considerations

### Current Scope (v1.0)

The initial protocol has minimal security features:

- **No authentication**: Packs are publicly accessible
- **No signing**: Pack integrity not cryptographically verified
- **No sandboxing**: Downloaded packs execute in user's environment

### Recommended Server Practices

1. **Rate limiting**: Prevent abuse with request rate limits
2. **HTTPS**: Use TLS for all pack distribution
3. **Content validation**: Verify pack structure before serving
4. **Access logs**: Log all pack downloads for monitoring

### Recommended Client Practices

1. **Trust model**: Only download packs from trusted sources
2. **Manual review**: Review pack contents before use
3. **Version pinning**: Pin to specific versions in production
4. **Checksum verification**: Verify downloaded tarball integrity (future)

### Future Considerations

Potential security enhancements for future versions:

- **GPG signing**: Cryptographically sign packs
- **Checksums**: SHA-256 checksums in version listings
- **Access control**: Optional authentication for private packs
- **Content policy**: Automated scanning for malicious content

---

## Examples

### Example 1: Download Latest Pack

```bash
# Download latest version
curl -L https://packs.example.com/packs/platform-engineering/latest \
  -o platform-engineering.tar.gz

# Extract
tar -xzf platform-engineering.tar.gz

# Use with Autonav
cd platform-engineering
nav-query . "How do I deploy to Kubernetes?"
```

### Example 2: List and Download Specific Version

```bash
# List available versions
curl https://packs.example.com/packs/platform-engineering/versions | jq

# Download specific version
curl -L https://packs.example.com/packs/platform-engineering/1.0.0 \
  -o platform-engineering-1.0.0.tar.gz
```

### Example 3: Automated Download Script

```bash
#!/bin/bash
# download-pack.sh

PACK_SERVER="https://packs.example.com"
PACK_NAME="$1"
VERSION="${2:-latest}"

echo "Downloading $PACK_NAME version $VERSION..."

curl -L "$PACK_SERVER/packs/$PACK_NAME/$VERSION" \
  -o "$PACK_NAME.tar.gz" \
  -w "Downloaded: %{size_download} bytes\n"

tar -xzf "$PACK_NAME.tar.gz"
echo "Extracted to: $PACK_NAME/"
```

### Example 4: Version Check

```bash
#!/bin/bash
# check-updates.sh

PACK_SERVER="https://packs.example.com"
PACK_NAME="platform-engineering"
CURRENT_VERSION="1.0.0"

LATEST=$(curl -s "$PACK_SERVER/packs/$PACK_NAME/versions" | \
  jq -r '.versions[0].version')

if [ "$LATEST" != "$CURRENT_VERSION" ]; then
  echo "Update available: $CURRENT_VERSION -> $LATEST"
else
  echo "Already on latest version: $CURRENT_VERSION"
fi
```

---

## Implementation Guide

### Minimum Viable Server

A compliant pack server must:

1. Serve static files over HTTP(S)
2. Implement the three core endpoints (`/latest`, `/versions`, `/{version}`)
3. Return proper HTTP status codes
4. Set correct `Content-Type` headers
5. Organize packs in a standard directory structure

### Reference Implementation

See `/packages/knowledge-pack-server/` for a minimal TypeScript reference implementation.

**Key features:**
- ~150 lines of code
- No database (file-based)
- Express.js for HTTP server
- Serves packs from `./packs/` directory

### Server Directory Structure

```
pack-server/
├── packs/
│   ├── platform-engineering/
│   │   ├── 1.0.0/
│   │   │   └── platform-engineering-1.0.0.tar.gz
│   │   ├── 1.1.0/
│   │   │   └── platform-engineering-1.1.0.tar.gz
│   │   └── versions.json
│   └── aws-navigator/
│       ├── 1.0.0/
│       │   └── aws-navigator-1.0.0.tar.gz
│       └── versions.json
└── server.js
```

### Testing a Server Implementation

```bash
# Test /latest endpoint
curl -I http://localhost:3000/packs/platform-engineering/latest

# Test /versions endpoint
curl http://localhost:3000/packs/platform-engineering/versions

# Test /{version} endpoint
curl -I http://localhost:3000/packs/platform-engineering/1.0.0

# Test error handling
curl http://localhost:3000/packs/nonexistent-pack/latest
```

---

## Protocol Version History

### 1.0.0 (2025-11-17)

- Initial protocol specification
- HTTP endpoints: `/latest`, `/versions`, `/{version}`
- Tarball (.tar.gz) pack format
- Metadata schema v1
- Semantic versioning
- Basic error handling

---

## Appendix: Design Decisions

### Why HTTP instead of npm?

**Advantages:**
- Decentralized: No package registry required
- Simple: Any web server can host packs
- Flexible: Easy to implement in any language
- Portable: Works across ecosystems

**Trade-offs:**
- No built-in dependency resolution (acceptable for MVP)
- No native version constraints (future enhancement)

### Why Tarballs instead of Git?

**Advantages:**
- Self-contained: Single file distribution
- Version-specific: Immutable snapshots
- Lightweight: No git history overhead
- Universal: Works without git client

**Trade-offs:**
- Less transparent than git repos
- Harder to preview before download (mitigated by metadata endpoint)

### Why Semantic Versioning?

**Advantages:**
- Industry standard
- Clear upgrade expectations
- Tooling support
- Community familiarity

**Trade-offs:**
- None significant for this use case

---

## Future Enhancements

Potential additions for future protocol versions:

1. **Pack dependencies**: Reference other packs
2. **Checksums**: SHA-256 verification
3. **Signing**: GPG or equivalent
4. **Delta updates**: Incremental pack updates
5. **Search API**: Search across pack contents
6. **Registry federation**: Distributed pack discovery
7. **Private packs**: Authentication support

---

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [HTTP/1.1 Status Codes](https://tools.ietf.org/html/rfc7231#section-6)
- [ISO 8601 Date Format](https://www.iso.org/iso-8601-date-and-time-format.html)
- [SPDX License List](https://spdx.org/licenses/)

---

## Contact

For questions or feedback about this protocol:
- GitHub Issues: [platform-ai/issues](https://github.com/terraboops/platform-ai/issues)
- Email: terra@example.com

---

**License:** TBD
