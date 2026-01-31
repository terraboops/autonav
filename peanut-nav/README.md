# peanut-nav

Knowledge navigator for Peanut Nav

## Setup

This navigator was created using `@autonav/core`.

### Directory Structure

```
peanut-nav/
├── config.json          # Navigator configuration
├── CLAUDE.md           # System prompt and grounding rules
├── knowledge/          # Add your documentation here
├── .claude/
│   └── plugins.json   # Plugin configuration
├── .gitignore
└── README.md          # This file
```

## Adding Documentation

1. Add your markdown files, text files, or documentation to the `knowledge/` directory
2. Organize files in subdirectories as needed
3. The navigator will search all files in this directory when answering questions

Example structure:
```
knowledge/
├── getting-started/
│   └── quickstart.md
├── deployment/
│   ├── aws.md
│   └── kubernetes.md
└── troubleshooting/
    └── common-issues.md
```

## Using the Navigator

### Option 1: Interactive Mode (Recommended)

The simplest way to use your navigator is with Claude Code directly:

```bash
cd peanut-nav
claude
```

This opens an interactive session with your navigator's context already loaded. You can:
- Have natural conversations
- Ask follow-up questions
- Let Claude search your docs

The `CLAUDE.md` file tells Claude what this navigator knows about and how to behave.

### Option 2: Programmatic Queries

For scripts and automation, use structured queries:

```bash
npx @autonav/core query . "How do I deploy to production?"
```

Or from the parent directory:
```bash
npx @autonav/core query ./peanut-nav "Your question here"
```

## Response Format

The navigator returns structured JSON responses:

```json
{
  "protocolVersion": "1.0.0",
  "query": "Your question",
  "answer": "Detailed answer with citations",
  "sources": [
    {
      "filePath": "path/to/source.md",
      "excerpt": "Relevant quote",
      "section": "Section name"
    }
  ],
  "confidence": 0.95
}
```

## Customization

### Updating Instructions

Edit `CLAUDE.md` to customize how the navigator behaves:
- Add domain-specific rules
- Include terminology definitions
- Specify answer formatting preferences

### Configuration

Edit `config.json` to:
- Update the navigator name or description
- Change the knowledge base path
- Add metadata fields

## Security

### Plugin Credentials

**⚠️ IMPORTANT**: If you use plugins (`.claude/plugins.json`), be aware:

1. **Credentials are stored in PLAIN TEXT** in `.claude/plugins.json`
2. **NEVER commit** `.claude/plugins.json` to version control
3. **Always add** `.claude/plugins.json` to your `.gitignore`
4. **Recommended**: Use environment variables instead:
   ```bash
   export SLACK_TOKEN="xoxb-your-token"
   export GITHUB_TOKEN="ghp_your-token"
   ```
5. **For production**: Use a secrets management system (AWS Secrets Manager, HashiCorp Vault, etc.)

### File Watcher Plugin

The file-watcher plugin has security restrictions:
- Cannot watch system directories (`/etc`, `/sys`, `/proc`, `/root`, etc.)
- Cannot watch sensitive user directories (`~/.ssh`, `~/.aws`, etc.)
- Only watches project-specific directories you explicitly configure

### GitHub/Slack Plugins

All content posted to GitHub and Slack is automatically scanned for credentials to prevent accidental exposure. However:
- Review all automated posts before enabling production use
- Use webhook secrets where applicable
- Limit plugin permissions to the minimum required

## Best Practices

1. **Keep docs updated**: The navigator is only as good as the knowledge base
2. **Organize clearly**: Use directories and clear file names
3. **Version control**: Commit both the navigator and knowledge base to git (but NOT `.claude/plugins.json`)
4. **Review responses**: Check that citations are accurate and relevant
5. **Security first**: Never commit credentials, use environment variables for tokens

## Troubleshooting

### Navigator can't find files

- Ensure files are in the `knowledge/` directory
- Check that file paths in responses match actual files
- Verify the `knowledgeBase` in `config.json` is correct

### Low confidence responses

- Add more detailed documentation
- Ensure docs cover the topic thoroughly
- Check that docs are up to date

### No answers to questions

- Verify the knowledge base contains relevant information
- Try rephrasing the question
- Ensure Claude Code is authenticated (run `claude` to check)

## Support

For issues with the navigator framework:
- GitHub: https://github.com/terraboops/autonav
- Documentation: See the main project README

---

**Created**: 2026-01-31T19:58:06.688Z
**Protocol Version**: 1.0.0
