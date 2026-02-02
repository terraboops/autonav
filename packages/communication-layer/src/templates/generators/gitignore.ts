/**
 * .gitignore template generator
 */

export function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build outputs
dist/
build/

# Environment variables
.env
.env.local

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
logs/

# Temporary files
tmp/
temp/

# Runtime state (optional - commit if you want to preserve state)
.claude/state/
`;
}
