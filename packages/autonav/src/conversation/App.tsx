/**
 * Ink-based TUI for interactive navigator conversation
 *
 * Uses Harness abstraction for multi-turn conversation, supporting
 * both Claude Code and chibi runtimes. Renders themed UI with markdown
 * support, matrix-style activity animation, and cohesive styling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { type Harness, type HarnessSession, ClaudeCodeHarness } from "../harness/index.js";
import { buildConversationSystemPrompt } from "./prompts.js";
import {
  ChatBanner,
  ChatInput,
  MarkdownText,
  UserResponse,
  SystemMessage,
  ActivityIndicator,
  Divider,
  colors,
  boxChars,
} from "../interview/ui/index.js";

// Check if debug mode is enabled
const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

// Model to use for conversation
const CONVERSATION_MODEL = "claude-sonnet-4-5";

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.error("[DEBUG]", ...args);
  }
}

/** Format tool use into a compact hacker-aesthetic display string */
function formatToolParams(
  toolName: string,
  input: Record<string, unknown>
): string {
  // Pick the most interesting params for each tool type
  const name = toolName.toLowerCase();
  const parts: string[] = [toolName];

  if (name.includes("read") || name === "cat") {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("write") || name.includes("edit")) {
    if (input.file_path) parts.push(String(input.file_path));
  } else if (name.includes("grep") || name.includes("search")) {
    if (input.pattern) parts.push(`/${String(input.pattern)}/`);
    if (input.path) parts.push(String(input.path));
  } else if (name.includes("glob")) {
    if (input.pattern) parts.push(String(input.pattern));
  } else if (name.includes("bash")) {
    if (input.command) {
      const cmd = String(input.command);
      parts.push(cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd);
    }
  } else {
    // Generic: show first string param value
    for (const val of Object.values(input)) {
      if (typeof val === "string" && val.length > 0) {
        parts.push(val.length > 50 ? val.slice(0, 47) + "..." : val);
        break;
      }
    }
  }

  return parts.join(" → ");
}

// ── Mood message pools ──────────────────────────────────────────────────────

const MOOD_START = [
  "Getting oriented...",
  "Surveying the landscape...",
  "Scanning the terrain...",
];

const MOOD_EXPLORING = [
  "Deep in thought...",
  "Connecting the dots...",
  "Piecing it together...",
  "Following the thread...",
  "Traversing the knowledge graph...",
];

const MOOD_THOROUGH = [
  "Leaving no stone unturned...",
  "Going deeper...",
  "Thoroughly investigating...",
  "Down the rabbit hole...",
];

const MOOD_READING = [
  "Studying the blueprints...",
  "Reading between the lines...",
  "Parsing the signal...",
  "Absorbing context...",
];

const MOOD_WRITING = [
  "Fingers flying...",
  "In the zone...",
  "Crafting code...",
  "Shaping the solution...",
  "Reshaping reality...",
];

const MOOD_BUILDING = [
  "Moment of truth...",
  "Compiling hopes and dreams...",
  "Building...",
];

const MOOD_TESTING = [
  "Crossing fingers...",
  "Testing fate...",
  "Validating...",
];

const MOOD_FLOWING = [
  "On a roll!",
  "Flow state achieved...",
  "Unstoppable...",
  "In the matrix...",
];

const MOOD_ERROR = [
  "Plot twist!",
  "Hmm, that's odd...",
  "Recalibrating...",
  "Unexpected terrain...",
  "Adjusting approach...",
];

// ── Mood state & helpers ────────────────────────────────────────────────────

interface MoodState {
  toolCount: number;
  lastError: boolean;
  consecutiveSuccess: number;
}

function randomFrom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
}

function isReadTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n.includes("read") || n === "glob" || n === "grep" || n === "cat";
}

function isWriteTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n.includes("write") || n.includes("edit");
}

function isBuildCommand(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName.toLowerCase() !== "bash") return false;
  const cmd = String(input.command || "");
  return /\b(build|compile|tsc|webpack|esbuild)\b/.test(cmd);
}

function isTestCommand(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName.toLowerCase() !== "bash") return false;
  const cmd = String(input.command || "");
  return /\b(test|jest|vitest|check|lint)\b/.test(cmd);
}

function pickMood(
  toolName: string,
  input: Record<string, unknown>,
  state: MoodState
): string {
  if (state.lastError) return randomFrom(MOOD_ERROR);
  if (state.consecutiveSuccess >= 8) return randomFrom(MOOD_FLOWING);
  if (state.toolCount <= 2) return randomFrom(MOOD_START);
  if (isBuildCommand(toolName, input)) return randomFrom(MOOD_BUILDING);
  if (isTestCommand(toolName, input)) return randomFrom(MOOD_TESTING);
  if (isWriteTool(toolName)) return randomFrom(MOOD_WRITING);
  if (isReadTool(toolName)) return randomFrom(MOOD_READING);
  if (state.toolCount >= 10) return randomFrom(MOOD_THOROUGH);
  return randomFrom(MOOD_EXPLORING);
}

// ── Component types ─────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant" | "system" | "activity";
  content: string;
  id: number;
}

interface ActivityState {
  type: "thinking" | "tool";
  detail?: string;
}

interface ConversationAppProps {
  navigatorName: string;
  navigatorPath: string;
  navigatorSystemPrompt: string;
  knowledgeBasePath: string;
  harness?: Harness;
  mcpServers?: Record<string, unknown>;
  /** Whether sandbox is enabled for chat (default: true) */
  sandboxEnabled?: boolean;
  /** Raw config.json content for config-aware prompts */
  configJson?: string;
}

export function ConversationApp({
  navigatorName,
  navigatorPath,
  navigatorSystemPrompt,
  knowledgeBasePath,
  harness,
  mcpServers,
  sandboxEnabled = true,
  configJson,
}: ConversationAppProps) {
  // Finalized messages go into <Static> — printed once, never repainted.
  // Only the in-progress streaming message lives in the dynamic region.
  const [finalizedMessages, setFinalizedMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const msgIdRef = useRef<number>(0);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<HarnessSession | null>(null);
  const harnessRef = useRef<Harness>(harness ?? new ClaudeCodeHarness());
  const streamingTextRef = useRef<string>("");
  const hadToolsSinceTextRef = useRef<boolean>(false);
  const moodRef = useRef<MoodState>({ toolCount: 0, lastError: false, consecutiveSuccess: 0 });
  const lastCtrlCRef = useRef<number>(0);
  const exitHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exitHint, setExitHint] = useState<false | "c" | "d">(false);
  const { exit } = useApp();

  /** Finalize the current streaming message — move it to the static region. */
  const finalizeStreamingMessage = useCallback(() => {
    setStreamingMessage((prev) => {
      if (prev) {
        setFinalizedMessages((msgs) => [...msgs, prev]);
      }
      return null;
    });
  }, []);

  // Build the full system prompt
  const systemPrompt = buildConversationSystemPrompt(
    navigatorName,
    navigatorSystemPrompt,
    knowledgeBasePath,
    configJson
  );

  // Process events from harness session
  const processEvents = useCallback(async (events: AsyncIterable<import("../harness/index.js").AgentEvent>) => {
    try {
      debugLog("Waiting for response...");
      setActivity({ type: "thinking" });
      streamingTextRef.current = "";
      hadToolsSinceTextRef.current = false;
      // Reset mood state for each turn
      moodRef.current = { toolCount: 0, lastError: false, consecutiveSuccess: 0 };

      for await (const event of events) {
        debugLog("Received event type:", event.type);

        if (event.type === "tool_use") {
          moodRef.current.toolCount += 1;
          moodRef.current.consecutiveSuccess += 1;
          moodRef.current.lastError = false;
          const mood = pickMood(event.name, event.input, moodRef.current);
          setActivity({ type: "tool", detail: mood });
          hadToolsSinceTextRef.current = true;

          // Tool activity lines are ephemeral — they go directly into finalized
          // (static) so they don't trigger repaints of the streaming region.
          const paramSummary = formatToolParams(event.name, event.input);
          const id = ++msgIdRef.current;
          setFinalizedMessages((prev) => [
            ...prev,
            { role: "activity", content: paramSummary, id },
          ]);
        } else if (event.type === "tool_result" && event.isError) {
          moodRef.current.lastError = true;
          moodRef.current.consecutiveSuccess = 0;
        } else if (event.type === "text") {
          if (event.text && event.text.trim()) {
            setActivity(null);

            // If tools ran since last text, finalize the current streaming
            // message so it lands in Static before starting a new one.
            if (hadToolsSinceTextRef.current && streamingTextRef.current) {
              finalizeStreamingMessage();
              streamingTextRef.current = "";
            }
            hadToolsSinceTextRef.current = false;

            // Accumulate text for current block
            if (streamingTextRef.current) {
              streamingTextRef.current += "\n\n" + event.text;
            } else {
              streamingTextRef.current = event.text;
            }

            const accumulated = streamingTextRef.current;
            const id = msgIdRef.current; // keep same id while streaming same block
            setStreamingMessage({ role: "assistant", content: accumulated, id });
          }
        } else if (event.type === "result") {
          debugLog("Result received:", event.success);
          // Move the streaming message into the static region.
          finalizeStreamingMessage();
          break;
        }
      }

      streamingTextRef.current = "";
      setActivity(null);
      setIsLoading(false);
    } catch (err) {
      debugLog("Error processing response:", err);
      setError(
        err instanceof Error ? err.message : "Error communicating with Claude"
      );
      streamingTextRef.current = "";
      setActivity(null);
      setIsLoading(false);
    }
  }, [finalizeStreamingMessage]);

  // Handle special commands
  const handleCommand = useCallback(
    (command: string): boolean => {
      const cmd = command.toLowerCase().trim();

      if (cmd === "/help") {
        const id = ++msgIdRef.current;
        setFinalizedMessages((prev) => [
          ...prev,
          {
            id,
            role: "system",
            content: `Available commands:
  /help    - Show this help message
  /status  - Show navigator status
  /clear   - Clear conversation history
  /exit    - Exit conversation mode

Or just type naturally to chat with your navigator.`,
          },
        ]);
        return true;
      }

      if (cmd === "/status") {
        const id = ++msgIdRef.current;
        setFinalizedMessages((prev) => [
          ...prev,
          {
            id,
            role: "system",
            content: `Navigator: ${navigatorName}
Path: ${navigatorPath}
Knowledge Base: ${knowledgeBasePath}
Model: ${CONVERSATION_MODEL}`,
          },
        ]);
        return true;
      }

      if (cmd === "/clear") {
        // Close existing session so next message starts fresh
        if (sessionRef.current) {
          sessionRef.current.close().catch(() => {});
          sessionRef.current = null;
        }
        const id = ++msgIdRef.current;
        setFinalizedMessages([{ id, role: "system", content: "Conversation cleared. Start fresh!" }]);
        setStreamingMessage(null);
        streamingTextRef.current = "";
        return true;
      }

      if (cmd === "/exit") {
        if (sessionRef.current) {
          sessionRef.current.close().catch(() => {});
        }
        exit();
        return true;
      }

      return false;
    },
    [navigatorName, navigatorPath, knowledgeBasePath, exit]
  );

  // Handle user input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isLoading) return;

      setInput("");

      // Check for commands
      if (value.startsWith("/")) {
        if (handleCommand(value)) {
          return;
        }
      }

      // Add user message to history (finalized immediately — never needs repainting)
      const id = ++msgIdRef.current;
      setFinalizedMessages((prev) => [...prev, { id, role: "user", content: value }]);
      setIsLoading(true);
      setError(null);

      try {
        debugLog("Sending user message:", value);

        let events: AsyncIterable<import("../harness/index.js").AgentEvent>;

        if (sessionRef.current) {
          // Multi-turn: send follow-up to existing session
          events = sessionRef.current.send(value);
        } else {
          // First message: create new session
          const session = harnessRef.current.run(
            {
              model: CONVERSATION_MODEL,
              systemPrompt,
              permissionMode: "acceptEdits",
              cwd: navigatorPath,
              mcpServers,
              // Per-nav sandbox: chat defaults to enabled (read-only access)
              ...(sandboxEnabled ? {
                sandbox: {
                  readPaths: [navigatorPath],
                },
              } : {}),
            },
            value
          );

          sessionRef.current = session;
          events = session;
        }

        await processEvents(events);
      } catch (err) {
        debugLog("Error sending message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsLoading(false);
      }
    },
    [isLoading, systemPrompt, navigatorPath, handleCommand, processEvents]
  );

  // Handle Ctrl+C / Ctrl+D (double-tap same key within 7s to exit)
  const lastExitKeyRef = useRef<"c" | "d" | null>(null);
  useInput((input, key) => {
    if (key.ctrl && (input === "c" || input === "d")) {
      const pressedKey = input as "c" | "d";
      const now = Date.now();
      if (now - lastCtrlCRef.current < 7000 && lastExitKeyRef.current === pressedKey) {
        // Second press of same key within 7 seconds — exit
        if (sessionRef.current) {
          sessionRef.current.close().catch(() => {});
        }
        exit();
      } else {
        // First press (or switched keys) — show hint matching the key they pressed
        lastCtrlCRef.current = now;
        lastExitKeyRef.current = pressedKey;
        setExitHint(pressedKey);
        if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
        const timer = setTimeout(() => {
          setExitHint(false);
          lastExitKeyRef.current = null;
        }, 7000);
        timer.unref(); // Don't keep the event loop alive after Ink unmounts
        exitHintTimerRef.current = timer;
      }
    }
  });

  // Clean up timers on unmount so Node can exit
  useEffect(() => {
    return () => {
      if (exitHintTimerRef.current) clearTimeout(exitHintTimerRef.current);
    };
  }, []);

  // Show banner only until the first message arrives
  const showBanner = finalizedMessages.length === 0 && streamingMessage === null;

  return (
    <Box flexDirection="column" padding={1}>
      {/* ── Static region ───────────────────────────────────────────────────
          Messages here are printed once and never redrawn.
          The ActivityIndicator's 80ms ticks only repaint the live region
          below, eliminating the full-history flash on every frame.       */}
      <Static items={finalizedMessages}>
        {(msg) => {
          const isEndOfTurn =
            msg.role === "assistant" &&
            (() => {
              const idx = finalizedMessages.indexOf(msg);
              const next = finalizedMessages[idx + 1];
              return next !== undefined && next.role !== "activity";
            })();

          return (
            <Box key={msg.id} flexDirection="column">
              {msg.role === "user" ? (
                <UserResponse content={msg.content} />
              ) : msg.role === "assistant" ? (
                <Box flexDirection="column" marginBottom={1}>
                  <Box marginBottom={0}>
                    <Text color={colors.accent}>
                      {boxChars.single.vertical} {navigatorName}
                    </Text>
                  </Box>
                  <Box marginLeft={2}>
                    <MarkdownText content={msg.content} />
                  </Box>
                </Box>
              ) : msg.role === "activity" ? (
                <Box marginLeft={4} marginBottom={0}>
                  <Text color={colors.dimmed}>
                    {boxChars.single.vertical}{" "}{"\u2699\uFE0F"}{"  "}{msg.content}
                  </Text>
                </Box>
              ) : (
                <SystemMessage content={msg.content} />
              )}
              {isEndOfTurn && <Divider />}
            </Box>
          );
        }}
      </Static>

      {/* Banner — shown before any messages, lives in the dynamic region
          so it gets replaced naturally once the first message arrives.   */}
      {showBanner && (
        <ChatBanner navigatorName={navigatorName} model={CONVERSATION_MODEL} />
      )}

      {/* ── Live region ─────────────────────────────────────────────────────
          Only the streaming assistant message (if any) lives here,
          so redraws stay proportional to this small area, not history. */}
      {streamingMessage && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={0}>
            <Text color={colors.accent}>
              {boxChars.single.vertical} {navigatorName}
            </Text>
          </Box>
          <Box marginLeft={2}>
            <MarkdownText content={streamingMessage.content} />
          </Box>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color={colors.error}>Error: {error}</Text>
        </Box>
      )}

      {/* Activity indicator — matrix rain animation */}
      {isLoading && activity && (
        <Box marginBottom={1} marginLeft={2}>
          <ActivityIndicator
            lines={1}
            width={30}
            message={activity.type === "thinking" ? "thinking..." : (activity.detail ?? "working...")}
          />
        </Box>
      )}

      {/* Exit hint */}
      {exitHint && (
        <Box marginBottom={0}>
          <Text color={colors.warning}>
            Press Ctrl+{exitHint === "d" ? "D" : "C"} again to exit
          </Text>
        </Box>
      )}

      {/* Input prompt */}
      {!isLoading && (
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      )}
    </Box>
  );
}
