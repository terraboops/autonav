# maintain — repo facts for autonav

Facts the `/maintain` sweep needs. Keep terse; update when the build,
flows, or cautions change.

## Repo

- Slug: `terraboops/autonav` (remote `git@github.com:terraboops/autonav.git`)
- Default branch: `main`
- Maintainer: `terraboops` (terra tauri) — solo, no CODEOWNERS

## Build & test

- Ecosystem: npm workspaces — `packages/*`, `packs/*` (`package-lock.json`)
- CLI package: `@autonav/core` in `packages/autonav`, bin `autonav`
- Full check (matches CI `ci.yml`):
  ```
  npm ci
  npm run typecheck   # runs build first, then per-workspace typecheck
  npm run build       # communication-layer, then core
  npm test            # vitest across workspaces --if-present
  ```
- Lint job runs `npm run format:check` (skips if absent).
- Build matrix: ubuntu-latest + macos-latest on Node 18.x/20.x.

## Run locally

- Global bin is linked: `autonav` → `/opt/homebrew/bin/autonav`.
- Main flows: `autonav init <name> [--pack <p>]`, `autonav query <nav> <q>`,
  `autonav chat <nav>`, `autonav memento <dir> <nav> [--pr --max-iterations N]`.
- Local navs available as targets: mahdi, thufir, neo, peanut-nav, ghola,
  bernard, wolfgang (under `~/Developer/*` and `~/Developer/unfold/*`).
- Sandbox: runs under nono (Seatbelt/Landlock). Config in each nav's
  `config.json` (`sandbox.*`). `AUTONAV_SANDBOX=0` disables.

## Merge convention

- **Squash merge**, delete branch. Recent history: `subject (#NN)`.
  (Older commits used merge commits; squash is current practice.)
- Release: bump `@autonav/core` version → `release.yml` publishes to npm.

## Dependency cautions

- `@anthropic-ai/claude-agent-sdk` — core harness dependency. A prior
  `0.1 → 0.2` bump required the FakeHarness E2E work; test the harness
  paths before bumping (mock at Harness level, not SDK level).
- ESM-only majors held back: chalk 5, chokidar 5, ora 9, ink 7, marked 18,
  tar 7. zod 3→4, react 18→19, typescript 5→6, vitest 1→4 are separate
  discussions.

## `--pr` verification note

`autonav memento --pr` calls `gh pr create`, which needs a real GitHub
remote — verifying it opens real PRs. Verify per-iteration branching by
running memento *without* `--pr` against a scratch git repo, or accept
that `--pr` testing lands real PRs on a disposable repo you then close.
