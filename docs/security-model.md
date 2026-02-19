# Security Model

Autonav uses defense in depth: multiple independent layers restrict what a navigator agent can do. Each layer fails independently, so a bypass in one doesn't compromise the others. Most layers degrade gracefully when their underlying mechanism is unavailable.

---

## The Harness Abstraction

Every agent session runs through a **harness** — a universal adapter that translates `AgentConfig` into runtime-specific options. The three implementations are:

- **ChibiHarness** — runs `chibi-json` as a subprocess, uses [nono](https://github.com/always-further/nono) for kernel-level sandboxing (Landlock/Seatbelt)
- **ClaudeCodeHarness** — uses the Claude Code Agent SDK, passes sandbox settings to the SDK runtime
- **OpenCodeHarness** — uses the [OpenCode](https://opencode.ai/) SDK (`@opencode-ai/sdk`), manages a shared server process with SSE event streaming

Callers set `AgentConfig.sandbox` without knowing which harness is active. The harness translates:

| Field | ChibiHarness | ClaudeCodeHarness | OpenCodeHarness |
|---|---|---|---|
| `sandbox.readPaths` | [`nono`](https://github.com/always-further/nono) `--read <path>` | SDK restricts writes to `cwd` | Denies `edit` + `bash` permissions |
| `sandbox.writePaths` | [`nono`](https://github.com/always-further/nono) `--allow <path>` | SDK restricts writes to `cwd` | Allows all permissions |
| `sandbox.blockNetwork` | [`nono`](https://github.com/always-further/nono) `--net-block` | Not used | Not supported |
| Mechanism | Landlock (Linux), Seatbelt (macOS) | Seatbelt (macOS), bubblewrap (Linux) | OpenCode permission system |
| Fallback | Runs unsandboxed if nono not on PATH | SDK handles platform detection | All permissions allowed |

> **Note**: The OpenCode harness translates sandbox config into OpenCode's permission system (`"allow"` / `"deny"` per tool). This is **application-level**, not kernel-enforced — a determined agent could potentially bypass it. Read-only sandbox profiles deny `edit` and `bash`; read-write profiles allow all permissions.

> **Source**: `src/harness/types.ts` (SandboxConfig, AgentConfig), `src/harness/sandbox.ts` (nono wrapper), `src/harness/claude-code-harness.ts` (configToSdkOptions), `src/harness/opencode-harness.ts` (permission config)

---

## Per-Operation Sandbox Profiles

Each operation gets a sandbox profile appropriate to its trust level. Defaults are set in the navigator config schema and can be overridden per-navigator in `config.json`:

| Operation | Default | Access Level | Rationale |
|---|---|---|---|
| `query` | enabled | Read-only to navigator directory | Queries should never modify state |
| `update` | enabled | Read+write to navigator directory | Updates modify the knowledge base |
| `chat` | enabled | Read-only to navigator directory | Interactive sessions read knowledge |
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

### Navigator-Level Allowed Tools

Navigators can declare tools they always need via `sandbox.allowedTools`. These are merged into every operation's tool list — including operations that normally restrict tools (like standup report). This lets a navigator declare "I need bash access to run `linear`" without modifying framework code.

```json
{
  "sandbox": {
    "allowedTools": ["Bash"]
  }
}
```

The `allowedTools` array accepts tool names (e.g., `"Bash"`, `"Read"`, `"Write"`) and is passed to every agent session the navigator spawns: query, update, chat, standup, and memento (both navigator and worker agents).

> **Source**: `packages/communication-layer/src/schemas/config.ts` (NavigatorConfigSchema), `src/adapter/navigator-adapter.ts` (query/update), `src/standup/loop.ts` (report/sync), `src/conversation/App.tsx` (chat), `src/memento/loop.ts` (memento)

---

## Layer 1: Sandboxing

File and network access is restricted at the lowest available level. The mechanism varies by harness:

### ChibiHarness — [nono](https://github.com/always-further/nono)

[nono](https://github.com/always-further/nono) is a lightweight, zero-dependency sandbox tool that enforces file and network access at the **kernel level** using Landlock (Linux) and Seatbelt (macOS). It's fast, composable, and wraps any command — you just prefix it with `nono run` and declare what the process is allowed to touch. Everything else is denied by the OS kernel itself, not by application-level checks.

Autonav wraps chibi subprocess commands with nono automatically:

```
nono run --silent --allow-cwd --read /path/to/nav -- chibi-json ...
```

- `--read`: read-only access to a path
- `--allow`: read+write access to a path
- `--allow-cwd`: always grants access to the working directory
- `--net-block`: blocks all network access (not used here — chibi makes its own API calls)
- System binary paths (`/bin`, `/usr/bin`, `/opt/homebrew`, etc.) are auto-added as read-only

**Auto-detection**: Autonav checks for [nono](https://github.com/always-further/nono) on PATH at startup. If installed, kernel sandboxing activates automatically. If not, chibi runs unsandboxed (the other layers still apply). Set `AUTONAV_SANDBOX=0` to force-disable.

> **Source**: `src/harness/sandbox.ts` (buildSandboxArgs, isSandboxEnabled, wrapCommand)

### ClaudeCodeHarness — SDK Sandbox

When `AgentConfig.sandbox` is set, the harness passes sandbox settings to the SDK:

```typescript
options.sandbox = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  allowUnsandboxedCommands: false,
};
```

The SDK uses Seatbelt (macOS) or bubblewrap (Linux) to restrict writes to `cwd` and subdirectories by default.

> **Source**: `src/harness/claude-code-harness.ts:130` (configToSdkOptions)

### OpenCodeHarness — Permission System

OpenCode doesn't have kernel-level sandboxing. Instead, `AgentConfig.sandbox` is translated into OpenCode's per-tool permission system:

- **Read-only** (`readPaths` set, no `writePaths`): `edit: "deny"`, `bash: "deny"` — the agent can search and read files but cannot modify them or run shell commands
- **Read-write** (`writePaths` set): all permissions allowed
- **No sandbox**: all permissions allowed (default headless behavior)

This is **application-level enforcement** — it relies on OpenCode's permission checks, not OS kernel restrictions. It's weaker than [nono](https://github.com/always-further/nono) or SDK sandboxing but still provides meaningful protection for read-only operations.

> **Source**: `src/harness/opencode-harness.ts` (serverConfig.permission in ensureServer)

---

## Layer 2: Working Directory Scoping

Every agent session sets `cwd` to the navigator's directory. This is the most fundamental constraint — the agent starts in and operates on its own directory.

- **Query/Update**: `cwd` = navigator directory
- **Standup report**: `cwd` = navigator directory
- **Standup sync**: `cwd` = navigator directory
- **Chat**: `cwd` = navigator directory (via `navigatorPath`)

`additionalDirectories` grants explicit access beyond `cwd` when needed (e.g., standup sync agents accessing working directories of monitored projects).

> **Source**: `src/adapter/navigator-adapter.ts` (query ~line 441, update ~line 644), `src/standup/loop.ts` (report, sync), `src/conversation/App.tsx`

---

## Layer 3: Tool Allowlists

Operations restrict which tools the agent can use via `allowedTools` and `disallowedTools`:

| Context | Allowed Tools | Rationale |
|---|---|---|
| Standup report | Read, Grep, Glob, WebFetch, WebSearch, MCP tools | Read-only — reporting doesn't modify |
| Standup sync | Read, Grep, Glob, Write, Edit, Bash, MCP tools | Sync phase may update files |
| Query | Default (all tools available) | Sandbox provides file-level restriction |
| Update | Default (all tools available) | Sandbox provides file-level restriction |

> **Source**: `src/standup/loop.ts` (allowedTools arrays in report and sync configs)

---

## Layer 4: Permission Modes

Each operation sets a permission mode controlling what the agent can do without user approval:

| Mode | Behavior | Used By |
|---|---|---|
| `"bypassPermissions"` | All actions auto-approved | query, update, standup, memento (non-interactive automation) |
| `"acceptEdits"` | File edits auto-approved; shell commands prompt | chat (interactive sessions) |

> **Source**: `src/adapter/navigator-adapter.ts`, `src/conversation/App.tsx`, `src/standup/loop.ts`

---

## Layer 5: Turn Limits and Budget Caps

Hard limits prevent runaway execution:

| Context | Max Turns | Max Budget |
|---|---|---|
| Query | 50 | Configurable via CLI |
| Cross-nav sub-query | 10 | — |
| Standup report (per nav) | 30 | — |
| Standup sync (per nav) | 30 | — |

`maxBudgetUsd` provides a hard spending cap per session — the harness terminates the session if the budget is exceeded.

> **Source**: `src/adapter/navigator-adapter.ts`, `src/tools/cross-nav.ts`, `src/standup/loop.ts`

---

## Layer 6: Cross-Navigator Cycle Detection

When navigators query each other, a depth counter prevents infinite loops:

```
MAX_QUERY_DEPTH = 3
```

Each cross-nav query increments the depth via a closure counter. Queries beyond depth 3 are rejected with an error. This applies to both the generic `query_navigator` tool and the per-navigator `ask_<name>` tools.

> **Source**: `src/tools/cross-nav.ts:16` (MAX_QUERY_DEPTH), `src/tools/related-navs.ts:15`

---

## Layer 7: Ephemeral Home Directories

Each harness session gets an isolated temporary home directory:

```
/tmp/autonav-chibi-<uuid>/
```

This directory is:
- Created fresh for each session
- Auto-cleaned on session close
- Always included in `writePaths` when nono sandboxing is active
- Used to inject custom plugins/tools into the agent's environment

Override the base location with `AUTONAV_<HARNESS>_HOME` (e.g., `AUTONAV_CHIBI_HOME=/tmp/my-chibi`).

> **Source**: `src/harness/ephemeral-home.ts` (createEphemeralHome)

---

## Layer 8: Credential Sanitization

All plugin output passes through credential detection and masking:

**Detected patterns:**
- Slack tokens (`xoxb-`, `xoxp-`)
- GitHub tokens (`ghp_`, `gho_`, `ghs_`)
- OpenAI/Anthropic keys (`sk-`)
- AWS credentials (`AKIA`, `aws_secret_access_key`)
- Bearer tokens, generic API keys

**Functions:**
| Function | Purpose |
|---|---|
| `sanitizeCredentials(text)` | Mask sensitive tokens in arbitrary text |
| `sanitizeError(error)` | Sanitize error messages before logging |
| `sanitizeConfigForLogging(config)` | Replace sensitive config fields with `***SET***` |
| `createSafeError(error, context)` | Create error with sanitized context |
| `assertNoCredentialsInText(text, field)` | Throw if credentials detected in user-facing content |

> **Source**: `src/plugins/utils/security.ts`

---

## Layer 9: File Watcher Path Restrictions

The file watcher plugin has hardcoded forbidden paths that cannot be watched:

```
/etc, /sys, /proc, /dev, /root, /boot, /var/log,
/usr/bin, /usr/sbin, /bin, /sbin,
~/.ssh, ~/.aws, ~/.config,
/Windows, /System, C:\Windows, C:\System
```

Additionally, root-level directories (path depth <= 2) are rejected to prevent watching entire filesystems.

> **Source**: `src/plugins/implementations/file-watcher/index.ts:42` (FORBIDDEN_PATHS, validateSafePath)

---

## Summary

| Layer | Protects Against | Mechanism | Harness-Specific? |
|---|---|---|---|
| Sandboxing | Unauthorized file/network access | OS syscalls ([nono](https://github.com/always-further/nono), SDK) or app-level permissions (OpenCode) | Yes |
| Working directory | Agent escaping its directory | `cwd` scoping | No |
| Tool allowlists | Agents using dangerous tools | `allowedTools` / `disallowedTools` | No |
| Permission modes | Unauthorized interactive actions | `permissionMode` | No |
| Turn/budget limits | Runaway execution and cost | `maxTurns`, `maxBudgetUsd` | No |
| Cycle detection | Infinite nav-to-nav loops | Depth counter (max 3) | No |
| Ephemeral homes | Session state leaking | Temp dir per session | Chibi only |
| Credential sanitization | Secret exposure in output | Regex masking | No |
| File watcher restrictions | Watching sensitive directories | Hardcoded forbidden paths | No |

---

## Known Limitations

- **Cross-nav queries don't inherit sandbox profiles.** When navigator A queries navigator B, the sub-session doesn't read B's per-operation sandbox config. The sub-query runs with the cross-nav tool's hardcoded config (model, maxTurns, cwd only).
- **Nav-to-nav file isolation is behavioral, not kernel-enforced.** System prompts instruct navigators to stay within their knowledge base, but nothing prevents a sandboxed agent from reading files in another navigator's directory if both are within the sandbox's read paths.
- **`blockNetwork` is disabled for chibi.** The chibi subprocess makes its own API calls to OpenRouter, so blocking network would prevent it from functioning.
- **Graceful fallback means no sandbox.** If [nono](https://github.com/always-further/nono) is not installed, ChibiHarness runs without kernel sandboxing. The other layers still apply.
- **OpenCode sandbox is application-level only.** The OpenCode harness uses permission flags (`edit: "deny"`, `bash: "deny"`) rather than kernel enforcement. This prevents casual misuse but is not as strong as Landlock/Seatbelt.
- **SDK sandbox field is forward-looking.** The Claude Code Agent SDK's `Options` type does not yet expose a `sandbox` field in its public types. The settings are passed through as `Record<string, unknown>` — they take effect when the SDK adds support.
