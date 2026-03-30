# Security Model

Autonav uses defense in depth: multiple independent layers restrict what a navigator agent can do. Each layer fails independently, so a bypass in one doesn't compromise the others.

---

## The Harness Abstraction

Every agent session runs through a **harness** — a universal adapter that translates `AgentConfig` into runtime-specific options. The three implementations are:

- **ClaudeCodeHarness** — uses the Claude Code Agent SDK, delegates sandboxing to [nono](https://github.com/always-further/nono) (default) or the SDK's built-in Seatbelt/bubblewrap sandbox
- **ChibiHarness** — runs `chibi-json` as a subprocess, uses [nono](https://github.com/always-further/nono) for kernel-level sandboxing (Landlock/Seatbelt)
- **OpenCodeHarness** — uses the [OpenCode](https://opencode.ai/) SDK (`@opencode-ai/sdk`), manages a shared server process with SSE event streaming

### Sandbox Provider Model

Each navigator selects a sandbox provider in `config.json`:

```json
{
  "sandbox": {
    "provider": "nono"
  }
}
```

| Provider | Mechanism | Behavior When Missing |
|---|---|---|
| `"nono"` (default) | Kernel-enforced via [nono](https://github.com/always-further/nono) (Seatbelt on macOS, Landlock on Linux) | **Hard error** — refuses to start |
| `"claude-code"` | Claude Code SDK's built-in Seatbelt/bubblewrap sandbox | Always available (bundled with SDK) |
| `"none"` | No sandbox enforcement | N/A |

There is **no silent fallback**. If nono is configured (the default) but not installed, autonav fails with install instructions rather than running unsandboxed.

### Harness Sandbox Matrix

| Field | ClaudeCodeHarness (nono) | ClaudeCodeHarness (claude-code) | ChibiHarness | OpenCodeHarness |
|---|---|---|---|---|
| `sandbox.readPaths` | `nono --read <path>` via flags file | SDK sandbox | `nono --read <path>` | Denies `edit` + `bash` |
| `sandbox.writePaths` | `nono --allow <path>` via flags file | SDK sandbox | `nono --allow <path>` | Allows all permissions |
| `sandbox.blockNetwork` | `nono --net-block` | Not supported | `nono --net-block` | Not supported |
| Fallback | Hard error if nono missing | N/A | Hard error if nono missing | All permissions allowed |

> **Source**: `src/harness/types.ts` (SandboxConfig, SandboxProvider), `src/harness/sandbox.ts` (nono wrapper), `src/harness/claude-code-harness.ts` (configToSdkOptions), `src/harness/sandbox-config-builder.ts`

---

## Per-Operation Sandbox Profiles

Each operation gets a sandbox profile appropriate to its trust level. Defaults are set in the navigator config schema and can be overridden per-navigator in `config.json`:

| Operation | Default | Access Level | Rationale |
|---|---|---|---|
| `query` | enabled | Read-only to navigator directory | Queries should never modify state |
| `update` | enabled | Read+write to navigator directory | Updates modify the knowledge base |
| `chat` | enabled | Read-only (configurable to readwrite) | Interactive sessions read knowledge |
| `standup` | enabled | Report: read-only; Sync: read+write | Reporting reads, syncing writes |
| `memento` | **disabled** | Full access | Worker agent needs full code access |

Override in `config.json`:
```json
{
  "sandbox": {
    "memento": { "enabled": true },
    "query": { "enabled": false }
  }
}
```

---

## Layer 1: Sandboxing

File and network access is restricted at the lowest available level.

### ClaudeCodeHarness — nono (default provider)

When provider is `"nono"`, the harness creates a wrapper script that runs the Claude Code CLI inside a [nono](https://github.com/always-further/nono) sandbox:

1. `buildNonoFlags()` converts `SandboxConfig` into nono CLI flags (`--read`, `--allow`, `--allow-command`, etc.)
2. `writeNonoFlagsFile()` writes flags to a temp file (one per line) to avoid shell injection from unquoted env var expansion
3. `createSdkWrapper()` generates a bash script that reads flags from the file and execs `nono run --profile claude-code ... -- claude`
4. The SDK spawns this wrapper instead of `claude` directly

The wrapper script uses nono's built-in `claude-code` profile as a base (providing `~/.claude`, keychain access, tmp dirs, etc.) and adds navigator-specific paths via the flags file.

**Shell injection prevention**: Flags are passed via a newline-delimited temp file read with `while IFS= read -r`, not via an unquoted env var. The flags file uses a random UUID in its filename (e.g., `nono-flags-a1b2c3d4.txt`).

**Wrapper script security**: Uses a random UUID in the filename (e.g., `nono-claude-wrapper-a1b2c3d4e5f6.sh`) and is created with mode `0700` (owner-only) to prevent TOCTOU attacks.

> **Source**: `src/harness/sandbox.ts` (buildNonoFlags, writeNonoFlagsFile, createSdkWrapper), `src/harness/claude-code-harness.ts` (configToSdkOptions)

### ClaudeCodeHarness — claude-code provider

When provider is `"claude-code"`, the SDK's built-in Seatbelt/bubblewrap sandbox is enabled (`sandbox: { enabled: true }`). No nono dependency needed.

> **Source**: `src/harness/claude-code-harness.ts` (configToSdkOptions)

### ChibiHarness — nono

[nono](https://github.com/always-further/nono) wraps chibi subprocess commands automatically:

```
nono run --silent --allow-cwd --read /path/to/nav -- chibi-json ...
```

Uses `buildCapabilitySet()` from nono-ts to programmatically build profiles including Claude Code infrastructure paths, system binaries, and navigator-specific paths.

> **Source**: `src/harness/sandbox.ts` (buildCapabilitySet, wrapCommand)

### OpenCodeHarness — Permission System

OpenCode doesn't have kernel-level sandboxing. `AgentConfig.sandbox` is translated into OpenCode's per-tool permission system:

- **Read-only**: `edit: "deny"`, `bash: "deny"`
- **Read-write**: all permissions allowed

This is **application-level enforcement** — weaker than kernel sandboxing but still provides meaningful protection.

> **Source**: `src/harness/opencode-harness.ts`

---

## Layer 2: Working Directory Scoping

Every agent session sets `cwd` to the navigator's directory. `additionalDirectories` grants explicit access beyond `cwd` when needed.

> **Source**: `src/adapter/navigator-adapter.ts`, `src/conversation/App.tsx`, `src/standup/loop.ts`

---

## Layer 3: Tool Restrictions

Operations restrict which tools the agent can use via `disallowedTools`:

| Context | Mechanism | Effect | Rationale |
|---|---|---|---|
| Query | `disallowedTools` | Blocks Write, Edit, NotebookEdit | Read-only — queries should never modify state |
| Cross-nav query | `disallowedTools` | Blocks Write, Edit, NotebookEdit | Sub-queries are read-only |
| Update | No restriction | All tools available | Sandbox provides file-level restriction |
| Chat | No restriction | All tools available | Interactive — user present |
| Memento | No restriction | All tools available | Full access needed |
| Standup | No restriction | All tools available | Report reads, sync writes |

> **Source**: `src/adapter/navigator-adapter.ts`, `src/tools/cross-nav.ts`, `src/tools/related-navs.ts`

---

## Layer 4: Permission Modes

Each operation sets a permission mode controlling what the agent can do without user approval:

| Mode | Behavior | Used By |
|---|---|---|
| `"bypassPermissions"` | All actions auto-approved | query, update, memento |
| `"acceptEdits"` | File edits auto-approved; shell commands prompt | chat, standup |

> **Source**: `src/adapter/navigator-adapter.ts`, `src/conversation/App.tsx`, `src/standup/loop.ts`

---

## Layer 5: Turn Limits and Budget Caps

Hard limits prevent runaway execution:

| Context | Max Turns | Max Budget |
|---|---|---|
| Query | 50 | Configurable via CLI |
| Cross-nav sub-query | 10 | — |
| Standup report (per nav) | 15 | — |
| Standup sync (per nav) | 30 | — |

> **Source**: `src/adapter/navigator-adapter.ts`, `src/tools/cross-nav.ts`, `src/standup/loop.ts`

---

## Layer 6: Cross-Navigator Cycle Detection

When navigators query each other, a depth counter prevents infinite loops:

```
MAX_QUERY_DEPTH = 3
```

Each cross-nav query increments the depth via a closure counter. Queries beyond depth 3 are rejected with an error. Cross-nav sub-sessions inherit the target navigator's sandbox configuration via `buildSandboxConfigForOperation()`.

> **Source**: `src/tools/cross-nav.ts`, `src/tools/related-navs.ts`, `src/harness/sandbox-config-builder.ts`

---

## Layer 7: Ephemeral Home Directories

Each harness session can get an isolated temporary home directory:

```
/tmp/autonav-<harness>-<uuid>/
```

This directory is created fresh for each session, auto-cleaned on close, and always included in `writePaths` when nono sandboxing is active.

> **Source**: `src/harness/ephemeral-home.ts`

---

## Layer 8: Credential Sanitization

All plugin output passes through credential detection and masking.

**Detected patterns:** Slack tokens, GitHub tokens, OpenAI/Anthropic keys, AWS credentials, Bearer tokens, generic API keys.

> **Source**: `src/plugins/utils/security.ts`

---

## Layer 9: Environment Variable Filtering

The Claude Code subprocess receives a **filtered** environment — only variables needed for operation are forwarded. Plugin tokens, database credentials, and other secrets in the parent environment are stripped.

Allowed categories: system basics (`PATH`, `HOME`, `TERM`), Anthropic API authentication, autonav internals, git config, and Node runtime vars.

> **Source**: `src/harness/claude-code-harness.ts` (buildCleanEnv, ALLOWED_ENV_VARS)

---

## Layer 10: Config Input Validation

Navigator `config.json` fields are validated at parse time:

- **Paths**: Must not contain `..` (traversal), null bytes, or be empty
- **Commands**: Must not be shell interpreters (`bash`, `sh`, `zsh`), privilege escalation (`sudo`, `su`), destructive tools (`rm`, `chmod`), network tools (`nc`, `socat`), or language interpreters (`python`, `node`, `ruby`)
- **Commands**: Must be bare names (no `/` paths) — resolved from PATH by the sandbox

The full deny-list is exported as `DENIED_SANDBOX_COMMANDS` from `@autonav/communication-layer`.

> **Source**: `packages/communication-layer/src/schemas/config.ts` (SafePathSchema, SafeCommandSchema, DENIED_SANDBOX_COMMANDS)

---

## Layer 11: File Watcher Path Restrictions

The file watcher plugin has hardcoded forbidden paths that cannot be watched (`/etc`, `/sys`, `/proc`, `/dev`, `/root`, `~/.ssh`, `~/.aws`, etc.). Root-level directories (path depth <= 2) are rejected.

> **Source**: `src/plugins/implementations/file-watcher/index.ts`

---

## Layer 12: Sandbox Diagnostic Tool

Every agent session gets a `sandbox_query` MCP tool that enables navigators to check their own sandbox status:

- Check if a path operation (read/write) would be allowed
- Check if network access is permitted
- Check if a specific CLI command is allowed
- Get a policy summary

Always registered, even when sandbox is disabled — navigators should always be able to diagnose their permissions.

> **Source**: `src/tools/sandbox-query.ts`

---

## Summary

| Layer | Protects Against | Mechanism | Harness-Specific? |
|---|---|---|---|
| Sandboxing | Unauthorized file/network access | Kernel (nono/Seatbelt) or app-level (OpenCode) | Yes |
| Working directory | Agent escaping its directory | `cwd` scoping | No |
| Tool restrictions | Agents using dangerous tools | `disallowedTools` | No |
| Permission modes | Unauthorized interactive actions | `permissionMode` | No |
| Turn/budget limits | Runaway execution and cost | `maxTurns`, `maxBudgetUsd` | No |
| Cycle detection | Infinite nav-to-nav loops | Depth counter (max 3) | No |
| Ephemeral homes | Session state leaking | Temp dir per session | Chibi |
| Credential sanitization | Secret exposure in output | Regex masking | No |
| Env filtering | Secret leakage to subprocess | Allowlist-based env | ClaudeCode |
| Config validation | Path traversal, dangerous commands | Zod schema validation | No |
| File watcher restrictions | Watching sensitive directories | Hardcoded forbidden paths | No |
| Sandbox diagnostics | Opaque sandbox behavior | `sandbox_query` MCP tool | No |

---

## Known Limitations

- **Nav-to-nav file isolation is behavioral, not kernel-enforced.** System prompts instruct navigators to stay within their knowledge base, but nothing prevents a sandboxed agent from reading files in another navigator's directory if both are within the sandbox's read paths.
- **`blockNetwork` is disabled for chibi.** The chibi subprocess makes its own API calls to OpenRouter, so blocking network would prevent it from functioning.
- **OpenCode sandbox is application-level only.** The OpenCode harness uses permission flags rather than kernel enforcement. Weaker than nono or SDK sandboxing.
- **Cross-nav depth counter is not propagated into sub-sessions.** The counter is a closure variable on the tool handler. If cross-nav tools were added to sub-sessions, the depth would need to be threaded through.
