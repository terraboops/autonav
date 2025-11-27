# Knowledge Pack Protocol

HTTP API for distributing knowledge packs.

## Endpoints

```
GET /packs/{name}/latest     # Download latest version (tarball)
GET /packs/{name}/versions   # List available versions (JSON)
GET /packs/{name}/{version}  # Download specific version (tarball)
```

## Pack format

Tarball containing:

```
my-pack/
├── metadata.json           # Required: name, version, description
├── system-configuration.md # Required: domain instructions
└── knowledge/              # Required: documentation files
    └── *.md
```

## metadata.json

```json
{
  "name": "platform-engineering",
  "version": "1.0.0",
  "description": "Platform engineering docs",
  "updated": "2025-11-17T00:00:00Z"
}
```

## system-configuration.md

Tells the navigator what it knows about:

```markdown
# Platform Engineering

## Domain
- Kubernetes deployment
- Monitoring (Prometheus, Grafana)
- Incident response

## Response Guidelines
- Cite specific files
- Include working commands
- Mention prerequisites
```

## Usage

```bash
# Download and extract
curl -L https://example.com/packs/platform-engineering/latest -o pack.tar.gz
tar -xzf pack.tar.gz

# Use with autonav
autonav init my-nav --pack platform-engineering
```

## Hosting

Any HTTP server works. Put tarballs at the expected paths:

```
packs/
├── platform-engineering/
│   ├── 1.0.0/platform-engineering-1.0.0.tar.gz
│   └── 1.1.0/platform-engineering-1.1.0.tar.gz
```

See `packages/knowledge-pack-server/` for a reference implementation.
