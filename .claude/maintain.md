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

- `@anthropic-ai/claude-agent-sdk` — core harness dependency, at `0.3.201`
  (2026-07). Peer-requires `@anthropic-ai/sdk >=0.93` and `zod ^4`. Harness
  code (`claude-code-harness.ts`) was unchanged across 0.2→0.3.
- **zod 4** (merged 2026-07) — needs a **top-level `overrides.zod`** in root
  `package.json`, or `nono-ts → mintlify` (a big zod-3 subtree) wins the root
  hoist and our packages resolve zod 3 → runtime `_zod.def` crash in
  `config-describe.ts`. `.refine(fn, { error })` object form breaks under TS 6
  — use the string-message form. Commit a **freshly regenerated lockfile**
  (`rm package-lock.json && npm install`); incremental installs leave zod 3.
- **Node 25 (local) is unsupported.** CI is Node 20/22; on Node 25 the zod
  hoist resolves to zod 3 and tests fail locally even when CI is green —
  **trust CI, not local `npm ci`, on Node 25.**
- **react 19 / ink 7 — BLOCKED (PR #67 open).** `ink-testing-library@4` (its
  latest) can't capture ink 7 render output → `interview-app.test.tsx` gets
  empty frames (2 tests). Also needs `overrides` deduping react/react-dom/ink/
  `@types/react`. Merge only once ink-testing-library supports ink 7 or those
  tests are rewritten.
- Merged majors (2026-07): typescript 6, vitest 4, express 5, octokit 22,
  slack 7, commander 15, chalk 5, chokidar 5, ora 9, marked 18, tar 7,
  @anthropic-ai/sdk 0.110.

## `--pr` verification note

`autonav memento --pr` calls `gh pr create`, which needs a real GitHub
remote — verifying it opens real PRs. Verify per-iteration branching by
running memento *without* `--pr` against a scratch git repo, or accept
that `--pr` testing lands real PRs on a disposable repo you then close.
