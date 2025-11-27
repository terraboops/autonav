# platform-navigator

Example navigator for platform engineering.

## Structure

```
platform-navigator/
├── config.json       # Navigator configuration
├── CLAUDE.md         # System prompt
└── knowledge-base/   # Documentation
```

## Usage

```bash
autonav query . "How do I deploy?"
```

## Adding docs

Put markdown files in `knowledge-base/`. The navigator searches all files there.
