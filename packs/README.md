# Knowledge Packs

## Implementation Status

These packs are quick, LLM-generated proof-of-concept examples demonstrating the pack format. They haven't been fine-tuned or validated against real-world usage. Expect them to be replaced with properly curated packs as the project matures.

## Overview

A knowledge pack is a bundle of documentation that a navigator can search and cite. Each pack contains:

- `metadata.json` - Name, version, description
- `system-configuration.md` - Instructions for the navigator (domain scope, response guidelines)
- `knowledge/` - The actual documentation files

Packs are distributed as tarballs via HTTP. See [docs/KNOWLEDGE_PACK_PROTOCOL.md](../docs/KNOWLEDGE_PACK_PROTOCOL.md) for the protocol spec.

## Pack Details

| Pack | Description | Status |
|------|-------------|--------|
| [platform-engineering](./platform-engineering/) | Kubernetes, deployment, monitoring, incident response | POC |
| [platform-navigator](./platform-navigator/) | Example navigator scaffold | POC |
