# Contributing to Platform AI

Thank you for your interest in contributing to Platform AI!

## Development Workflow

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

1. Clone the repository
```bash
git clone https://github.com/terraboops/platform-ai.git
cd platform-ai
```

2. Install dependencies
```bash
npm install
```

3. Build all packages
```bash
npm run build
```

4. Run tests
```bash
npm test
```

## Continuous Integration

### CI Pipeline

All pull requests and commits to `main` automatically run through our CI pipeline:

#### Test Job (Multi-version)
Runs on Node.js 18.x and 20.x:
- ✅ Type checking (`npm run typecheck`)
- ✅ Build all packages (`npm run build`)
- ✅ Run all tests (`npm test`)
- 📊 Upload coverage reports (Node 20.x only)

#### Lint Job
- ✅ Code formatting checks (if configured)

#### Build Matrix
Tests builds across multiple operating systems:
- Ubuntu (Linux)
- Windows
- macOS

### Test Requirements

**All PRs must:**
- ✅ Pass type checking
- ✅ Build successfully
- ✅ Pass all existing tests
- ✅ Include tests for new functionality
- ✅ Not decrease test coverage

### Running Tests Locally

```bash
# Run all tests
npm test

# Run tests in watch mode (per package)
cd packages/communication-layer
npm run test:watch

# Type check
npm run typecheck

# Build
npm run build

# Clean build artifacts
npm run clean
```

### Test Coverage

Current coverage:
- **communication-layer**: 55 tests covering schemas, validation, actors
- **autonav**: 20 tests covering adapter, loading, parsing, validation

### Adding Tests

1. Create test files in `tests/` directory
2. Use Vitest for testing framework
3. Follow existing test patterns
4. Ensure tests are deterministic and isolated

Example test structure:
```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## Package Structure

This is a monorepo with multiple packages:

```
packages/
├── communication-layer/    # Protocol definitions
└── autonav/               # CLI tools + Claude adapter

examples/
└── platform-navigator/    # Example navigator
```

### Making Changes

1. Create a feature branch
```bash
git checkout -b feature/my-feature
```

2. Make your changes

3. Add tests for new functionality

4. Ensure all tests pass locally
```bash
npm run typecheck
npm run build
npm test
```

5. Commit with clear messages
```bash
git commit -m "feat: add new feature"
```

6. Push and create a PR
```bash
git push origin feature/my-feature
```

### Commit Message Convention

We use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test additions/changes
- `refactor:` Code refactoring
- `chore:` Build/tooling changes

### Code Style

- TypeScript with strict mode
- Explicit return types on public functions
- Comprehensive JSDoc for public APIs
- Zod for runtime schema validation

### Review Process

1. CI must pass (all checks green)
2. Code review by maintainer
3. Approval required before merge
4. Squash and merge to main

## Questions?

Open an issue or discussion on GitHub!
