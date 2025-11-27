# @autonav/pack-server

Reference HTTP server for distributing knowledge packs.

## Usage

```bash
npx @autonav/pack-server --packs-dir ./packs
```

## Directory structure

```
packs/
├── platform-engineering/
│   └── 1.0.0/
│       ├── platform-engineering-1.0.0.tar.gz
│       └── metadata.json
```

## Endpoints

```
GET /packs/{name}/latest      # Download latest (tarball)
GET /packs/{name}/versions    # List versions (JSON)
GET /packs/{name}/{version}   # Download specific version (tarball)
GET /packs/{name}/metadata    # Get metadata (JSON)
GET /health                   # Health check
```

## CLI options

```bash
pack-server --port 8080 --packs-dir /var/packs
```

## Creating a pack

```bash
# Create pack structure
mkdir -p my-pack/knowledge
echo '{"name":"my-pack","version":"1.0.0"}' > my-pack/metadata.json

# Package it
tar -czf my-pack-1.0.0.tar.gz my-pack/

# Deploy
mkdir -p packs/my-pack/1.0.0
mv my-pack-1.0.0.tar.gz packs/my-pack/1.0.0/
```

See [KNOWLEDGE_PACK_PROTOCOL.md](../../docs/KNOWLEDGE_PACK_PROTOCOL.md) for the full spec.
