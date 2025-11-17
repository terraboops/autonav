# @platform-ai/knowledge-pack-server

Reference HTTP server for distributing Autonav knowledge packs.

## Overview

This package provides a minimal reference implementation of the Knowledge Pack Protocol v1.0.0. It demonstrates how to build a compliant pack distribution server in ~200 lines of TypeScript.

## Features

- **Protocol compliant**: Implements all required endpoints
- **Minimal dependencies**: Express.js + Zod only
- **File-based**: No database required
- **Simple deployment**: Run from any directory
- **Development friendly**: Hot reload support with tsx

## Quick Start

### Installation

```bash
npm install -g @platform-ai/knowledge-pack-server
```

Or run directly with npx:

```bash
npx @platform-ai/knowledge-pack-server
```

### Directory Setup

Create a `packs/` directory with your knowledge packs:

```bash
mkdir -p packs/platform-engineering/1.0.0
```

Each pack version should contain:
- `{pack-name}-{version}.tar.gz` - The pack tarball
- `metadata.json` - Pack metadata (optional, extracted from tarball)

```
packs/
├── platform-engineering/
│   ├── 1.0.0/
│   │   ├── platform-engineering-1.0.0.tar.gz
│   │   └── metadata.json
│   └── 1.1.0/
│       ├── platform-engineering-1.1.0.tar.gz
│       └── metadata.json
└── aws-navigator/
    └── 1.0.0/
        ├── aws-navigator-1.0.0.tar.gz
        └── metadata.json
```

### Start the Server

```bash
pack-server
```

Server starts on `http://localhost:3000` by default.

### Test the Endpoints

```bash
# Health check
curl http://localhost:3000/health

# List versions
curl http://localhost:3000/packs/platform-engineering/versions

# Get latest version
curl -L http://localhost:3000/packs/platform-engineering/latest \
  -o platform-engineering.tar.gz

# Get specific version
curl -L http://localhost:3000/packs/platform-engineering/1.0.0 \
  -o platform-engineering-1.0.0.tar.gz

# Get metadata
curl http://localhost:3000/packs/platform-engineering/metadata
```

## CLI Usage

```bash
pack-server [options]
```

### Options

- `--port <number>` - Port to listen on (default: 3000)
- `--packs-dir <path>` - Directory containing packs (default: ./packs)
- `--help` - Show help message

### Environment Variables

- `PORT` - Port to listen on (overridden by --port)
- `PACKS_DIR` - Packs directory (overridden by --packs-dir)

### Examples

```bash
# Custom port
pack-server --port 8080

# Custom packs directory
pack-server --packs-dir /var/www/packs

# Using environment variables
PORT=8080 PACKS_DIR=/var/packs pack-server
```

## Programmatic Usage

```typescript
import { KnowledgePackServer } from "@platform-ai/knowledge-pack-server";

const server = new KnowledgePackServer("/path/to/packs");

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "protocol": "knowledge-pack/1.0.0"
}
```

### GET /packs/{pack-name}/latest

Download the latest version of a pack.

**Response:**
- Content-Type: `application/gzip`
- Headers: `X-Pack-Name`, `X-Pack-Version`
- Body: Tarball (.tar.gz)

### GET /packs/{pack-name}/versions

List all available versions of a pack.

**Response:**
```json
{
  "pack": "platform-engineering",
  "versions": [
    {
      "version": "1.1.0",
      "released": "2025-11-17T10:00:00Z",
      "size": 45632,
      "autonav_version": ">=0.1.0",
      "description": "Updated monitoring docs"
    }
  ]
}
```

### GET /packs/{pack-name}/{version}

Download a specific version of a pack.

**Response:**
- Content-Type: `application/gzip`
- Headers: `X-Pack-Name`, `X-Pack-Version`
- Body: Tarball (.tar.gz)

### GET /packs/{pack-name}/metadata

Get metadata for the latest version without downloading.

**Response:**
```json
{
  "name": "platform-engineering",
  "version": "1.0.0",
  "description": "Platform engineering knowledge pack",
  "author": "Terra",
  "updated": "2025-11-17T10:00:00Z",
  "tags": ["platform", "kubernetes"]
}
```

## Error Handling

Errors are returned as JSON:

```json
{
  "error": "Pack not found",
  "code": "PACK_NOT_FOUND",
  "message": "Pack 'invalid-pack' not found",
  "pack": "invalid-pack"
}
```

**Error Codes:**
- `PACK_NOT_FOUND` (404) - Pack doesn't exist
- `VERSION_NOT_FOUND` (404) - Version doesn't exist
- `INVALID_PACK_NAME` (400) - Invalid pack name format
- `INVALID_VERSION` (400) - Invalid version format
- `SERVER_ERROR` (500) - Internal server error

## Pack Format

Each pack version directory should contain:

1. **Tarball** (`{pack-name}-{version}.tar.gz`):
   - Required for serving packs
   - Created with: `tar -czf pack.tar.gz pack/`

2. **Metadata** (`metadata.json`):
   - Optional but recommended
   - Used for `/versions` and `/metadata` endpoints
   - Falls back to extracting from tarball if missing

## Creating Packs

### 1. Prepare Pack Directory

```bash
mkdir -p my-pack
cd my-pack
```

### 2. Create metadata.json

```json
{
  "$schema": "https://platform-ai.dev/schemas/knowledge-pack-metadata/1.0.0",
  "name": "my-pack",
  "version": "1.0.0",
  "description": "My awesome knowledge pack",
  "author": "Your Name",
  "updated": "2025-11-17T10:00:00Z",
  "autonav_version": ">=0.1.0",
  "tags": ["tutorial", "example"]
}
```

### 3. Create system-configuration.md

```markdown
# My Pack - System Configuration

## Domain Scope
This navigator helps with...

## Knowledge Base Organization
- `guide.md` - Getting started guide
- `reference.md` - API reference
```

### 4. Add Knowledge Files

```bash
mkdir knowledge
echo "# Getting Started" > knowledge/guide.md
echo "# API Reference" > knowledge/reference.md
```

### 5. Package as Tarball

```bash
cd ..
tar -czf my-pack-1.0.0.tar.gz my-pack/
```

### 6. Deploy to Server

```bash
mkdir -p packs/my-pack/1.0.0
cp my-pack-1.0.0.tar.gz packs/my-pack/1.0.0/
cp my-pack/metadata.json packs/my-pack/1.0.0/
```

### 7. Start Server

```bash
pack-server
```

## Deployment

### Local Development

```bash
npm run dev
```

Uses `tsx` for hot reload during development.

### Production

```bash
npm run build
npm start
```

Or with Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY packs ./packs
EXPOSE 3000
CMD ["node", "dist/cli.js"]
```

### Static Hosting

You can also serve packs from static file hosts (nginx, S3, etc.) by implementing the URL structure manually:

```nginx
location ~ ^/packs/([^/]+)/latest$ {
    # Redirect to latest version
}

location ~ ^/packs/([^/]+)/versions$ {
    # Serve versions.json
}

location ~ ^/packs/([^/]+)/([0-9]+\.[0-9]+\.[0-9]+)$ {
    # Serve tarball
}
```

## Protocol Specification

This server implements the Knowledge Pack Protocol v1.0.0.

See [KNOWLEDGE_PACK_PROTOCOL.md](../../docs/KNOWLEDGE_PACK_PROTOCOL.md) for the full specification.

## Architecture

```
KnowledgePackServer
├── setupRoutes()        # Configure Express routes
├── handleLatest()       # Serve latest version
├── handleVersions()     # List versions
├── handleMetadata()     # Return metadata
├── handleSpecificVersion()  # Serve specific version
├── servePack()          # Send tarball response
├── getAvailableVersions()   # Scan directory for versions
└── loadMetadata()       # Load metadata.json
```

## Contributing

This is a reference implementation. Feel free to:
- Add features (authentication, caching, etc.)
- Implement in other languages (Python, Go, Rust)
- Deploy in different environments (serverless, edge)

The protocol is language-agnostic and intentionally simple.

## License

TBD

## Links

- [Knowledge Pack Protocol](../../docs/KNOWLEDGE_PACK_PROTOCOL.md)
- [Autonav CLI](../autonav)
- [Platform AI Docs](../../docs)
