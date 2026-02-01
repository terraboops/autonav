# Contributing to Autonav

Thanks for your interest in contributing to Autonav! This guide will help you get started.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/platform-ai
   cd platform-ai
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build the project**:
   ```bash
   npm run build
   ```
5. **Run tests**:
   ```bash
   npm test
   ```

## Development Workflow

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our code style:
   - Use TypeScript strict mode
   - Add explicit return types on public functions
   - Use Zod for runtime schema validation
   - Follow existing patterns in the codebase

3. **Test your changes**:
   ```bash
   npm test
   npm run typecheck
   ```

4. **Commit with clear messages**:
   ```bash
   git commit -m "feat: add new feature"
   ```

   We follow conventional commits:
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Test additions or updates
   - `chore:` - Maintenance tasks

### Submitting Changes

1. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub with:
   - Clear description of what changed and why
   - Reference any related issues
   - Screenshots/examples if applicable

3. **Respond to feedback** - we'll review your PR and may request changes

## Help Wanted

### Knowledge Packs
Create knowledge packs for popular domains:
- Kubernetes operations
- AWS troubleshooting
- Database administration
- Frontend frameworks
- Security practices

See [KNOWLEDGE_PACK_PROTOCOL.md](./docs/KNOWLEDGE_PACK_PROTOCOL.md) for details.

### Documentation
- Improve README clarity
- Add usage examples
- Write tutorials
- Fix typos and errors

### Bug Reports
Found a bug? Open an issue with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Node version, etc.)

### Feature Requests
Have an idea? Open an issue describing:
- The use case or problem
- Proposed solution
- Alternative approaches considered

## Code Style

### TypeScript
```typescript
// ✓ Good - explicit return type, clear naming
export function validateSource(source: Source): ValidationResult {
  // implementation
}

// ✗ Bad - implicit return type
export function validateSource(source: Source) {
  // implementation
}
```

### Zod Schemas
```typescript
// ✓ Good - descriptive schema with validation
const SourceSchema = z.object({
  filePath: z.string().min(1),
  relevance: z.enum(['high', 'medium', 'low']),
  lineNumbers: z.array(z.number()).optional(),
});

// ✗ Bad - overly permissive
const SourceSchema = z.any();
```

### Error Handling
```typescript
// ✓ Good - specific error types, helpful messages
if (!fs.existsSync(navigatorPath)) {
  throw new NavigatorNotFoundError(
    `Navigator not found at ${navigatorPath}`
  );
}

// ✗ Bad - generic errors
if (!fs.existsSync(navigatorPath)) {
  throw new Error('not found');
}
```

## Testing

### Unit Tests
```typescript
import { describe, it, expect } from 'vitest';

describe('validateSource', () => {
  it('should validate existing source files', () => {
    const result = validateSource({
      filePath: 'knowledge/deployment.md',
      relevance: 'high',
    });
    expect(result.isValid).toBe(true);
  });

  it('should reject non-existent files', () => {
    const result = validateSource({
      filePath: 'knowledge/fake.md',
      relevance: 'high',
    });
    expect(result.isValid).toBe(false);
  });
});
```

### Integration Tests
Test CLI commands end-to-end:
```typescript
describe('autonav init', () => {
  it('should create navigator directory structure', async () => {
    await execCommand('autonav init test-nav');
    expect(fs.existsSync('test-nav/CLAUDE.md')).toBe(true);
    expect(fs.existsSync('test-nav/config.json')).toBe(true);
  });
});
```

## Project Structure

```
platform-ai/
├── packages/
│   ├── autonav/              # Main CLI and framework
│   │   ├── src/
│   │   │   ├── cli/          # CLI commands
│   │   │   ├── plugins/      # Plugin implementations
│   │   │   └── interview/    # Interactive setup
│   │   └── tests/
│   └── communication-layer/  # Schemas and validation
│       ├── src/
│       │   ├── protocols/    # Protocol definitions
│       │   └── schemas/      # Zod schemas
│       └── tests/
├── packs/
│   └── platform-engineering/ # Example knowledge pack
└── docs/                     # Documentation
```

## Questions?

- **Technical questions**: Open a GitHub Discussion
- **Bug reports**: Open a GitHub Issue
- **Feature ideas**: Open a GitHub Issue with "enhancement" label
- **Security issues**: Email security@terratauri.com (do not open public issues)

## Code of Conduct

Be respectful, constructive, and professional. We're all here to build something useful together.

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

---

Thanks for contributing to Autonav! 🚀
