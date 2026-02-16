# Installing Autonav

---

## Quick Install

```bash
npm install -g @autonav/core
```

That's it. Run `autonav --version` to verify.

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | >= 18.0.0 | [nodejs.org](https://nodejs.org/) |
| **npm** | >= 9.0.0 | Comes with Node.js (or use pnpm) |
| **Claude Code** | Latest | [docs.claude.com](https://docs.claude.com/) — used as the default agent runtime |

### API Key / Authentication

Authentication depends on which agent runtime (harness) you use:

**Claude Code SDK** (default harness) — handles authentication via OAuth. You don't need to set `ANTHROPIC_API_KEY` separately if Claude Code is already authenticated. Just run `claude` in your terminal to verify.

**Chibi** (alternative harness) — uses its own configuration at `~/.chibi/config.toml`. Chibi supports OpenRouter, giving you access to a wide range of models beyond Claude. Configure your API keys through chibi's setup:

```bash
# Chibi handles its own auth — see chibi documentation for setup
# Once configured, use it with any autonav command:
autonav query my-nav "question" --harness chibi
```

**Direct Anthropic API** — if you need to set a key explicitly:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Add it to your shell profile (`~/.zshrc`, `~/.bashrc`) so it persists.

---

## Installation Methods

### npm (Recommended)

```bash
npm install -g @autonav/core
```

This installs the `autonav` binary globally.

### From Source

```bash
git clone https://github.com/terraboops/autonav
cd autonav
npm install
npm run build
```

The built binary is at `packages/autonav/dist/cli/autonav.js`. You can link it globally:

```bash
cd packages/autonav
npm link
```

### Development Setup

If you want to contribute or hack on autonav:

```bash
git clone https://github.com/terraboops/autonav
cd autonav
npm install
npm run build
```

Useful development commands:

```bash
npm run dev          # Watch mode — rebuilds on changes
npm test             # Run all tests
npm run typecheck    # TypeScript type checking
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full development workflow, code style, and PR guidelines.

---

## Configuration

### Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | API authentication (if not using Claude Code OAuth) | Conditional |
| `GITHUB_TOKEN` | Higher rate limits when installing packs from GitHub | No |
| `AUTONAV_DEBUG=1` | Enable debug logging | No |
| `AUTONAV_METRICS=1` | Enable metrics collection | No |
| `AUTONAV_HARNESS=chibi` | Override the default agent runtime | No |

### Optional Integrations

**LangSmith tracing** — If you use LangSmith for observability, autonav supports it as an optional peer dependency:

```bash
npm install langsmith
```

Configure with standard LangSmith environment variables (`LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2`, etc.).

---

## Verify Installation

```bash
# Check version
autonav --version
# → autonav v1.6.0

# Show help
autonav --help

# Quick smoke test — create and query a navigator
autonav init test-nav --quick
autonav query test-nav "What do you know?"
```

If `autonav --version` prints a version number, you're good to go. Head to the [Getting Started guide](getting-started.md) to create your first navigator.

---

## Troubleshooting

### `command not found: autonav`

The global npm bin directory isn't in your `PATH`. Find it and add it:

```bash
npm config get prefix
# Add the output + /bin to your PATH
# e.g., export PATH="$PATH:/usr/local/lib/node_modules/.bin"
```

Or use `npx`:

```bash
npx @autonav/core --version
```

### Node.js version too old

```
error @autonav/core requires Node.js >= 18.0.0
```

Upgrade Node.js. If you use `nvm`:

```bash
nvm install 18
nvm use 18
```

### Claude Code not found

Autonav uses Claude Code SDK as its default agent runtime. If you see errors about Claude Code:

1. Make sure Claude Code is installed: [docs.claude.com](https://docs.claude.com/)
2. Verify it's authenticated (run `claude` in your terminal)

**Or use Chibi instead.** Chibi is a fully supported alternative runtime that doesn't require Claude Code. It uses OpenRouter for model access, giving you access to models from multiple providers. Set it as the default:

```bash
# Per-command
autonav query my-nav "question" --harness chibi

# Or set globally via environment
export AUTONAV_HARNESS=chibi

# Or set per-navigator in config.json
# { "harness": { "type": "chibi" } }
```

### Permission errors on global install

```bash
# Fix npm permissions (recommended)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Then retry
npm install -g @autonav/core
```

### GitHub pack installation fails with rate limiting

If installing knowledge packs from GitHub gives 403 errors, set a GitHub token:

```bash
export GITHUB_TOKEN="ghp_..."
```

This increases the API rate limit from 60 to 5,000 requests per hour.

---

## Upgrading

```bash
# npm
npm update -g @autonav/core

# From source
git pull
npm install
npm run build
```

After upgrading, run `autonav migrate` on your existing navigators to apply any needed migrations:

```bash
autonav migrate ./my-navigator
```

Use `--dry-run` to see what would change before applying:

```bash
autonav migrate ./my-navigator --dry-run
```
