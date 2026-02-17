/**
 * Ink-based TUI for interactive navigator conversation
 *
 * Uses Harness abstraction for multi-turn conversation, supporting
 * both Claude Code and chibi runtimes. Renders themed UI with markdown
 * support, matrix-style activity animation, and cohesive styling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
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
  streaming?: boolean;
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
}

export function ConversationApp({
  navigatorName,
  navigatorPath,
  navigatorSystemPrompt,
  knowledgeBasePath,
  harness,
  mcpServers,
  sandboxEnabled = true,
}: ConversationAppProps) {
  const [messages, setMessages] = useState<Message[]>([]);
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

  // Build the full system prompt
  const systemPrompt = buildConversationSystemPrompt(
    navigatorName,
    navigatorSystemPrompt,
    knowledgeBasePath
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

          // Format tool params for display
          const paramSummary = formatToolParams(event.name, event.input);
          setMessages((prev) => [
            ...prev,
            { role: "activity", content: paramSummary },
          ]);
        } else if (event.type === "tool_result" && event.isError) {
          moodRef.current.lastError = true;
          moodRef.current.consecutiveSuccess = 0;
        } else if (event.type === "text") {
          if (event.text && event.text.trim()) {
            setActivity(null);

            // If tools ran since last text, finalize previous message
            // and start a new one so tool calls appear between text blocks
            if (hadToolsSinceTextRef.current && streamingTextRef.current) {
              // Finalize the previous streaming message
              setMessages((prev) =>
                prev.map((m) =>
                  m.streaming ? { ...m, streaming: false } : m
                )
              );
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

            setMessages((prev) => {
              // Find existing streaming message to update (search from end)
              let lastStreamingIdx = -1;
              for (let j = prev.length - 1; j >= 0; j--) {
                if (prev[j]?.role === "assistant" && prev[j]?.streaming) {
                  lastStreamingIdx = j;
                  break;
                }
              }

              if (lastStreamingIdx >= 0) {
                // Update existing streaming message
                const updated = [...prev];
                updated[lastStreamingIdx] = {
                  role: "assistant",
                  content: accumulated,
                  streaming: true,
                };
                return updated;
              }

              // Create new streaming message
              return [
                ...prev,
                { role: "assistant", content: accumulated, streaming: true },
              ];
            });
          }
        } else if (event.type === "result") {
          debugLog("Result received:", event.success);

          // Mark streaming message as complete
          setMessages((prev) =>
            prev.map((m) =>
              m.streaming ? { ...m, streaming: false } : m
            )
          );
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
  }, []);

  // Handle special commands
  const handleCommand = useCallback(
    (command: string): boolean => {
      const cmd = command.toLowerCase().trim();

      if (cmd === "/help") {
        setMessages((prev) => [
          ...prev,
          {
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
        setMessages((prev) => [
          ...prev,
          {
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
        setMessages([
          {
            role: "system",
            content: "Conversation cleared. Start fresh!",
          },
        ]);
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

      // Add user message to history
      setMessages((prev) => [...prev, { role: "user", content: value }]);
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

  // Determine if we should show the banner (only when no messages yet)
  const showBanner = messages.length === 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Banner — shown only on startup, scrolls away with messages */}
      {showBanner && (
        <ChatBanner
          navigatorName={navigatorName}
          model={CONVERSATION_MODEL}
        />
      )}

      {/* Conversation history */}
      {messages.map((msg, i) => {
        // Check if this is the last message before a role switch (for dividers)
        const next = messages[i + 1];
        const isEndOfTurn =
          msg.role === "assistant" &&
          !msg.streaming &&
          next !== undefined &&
          next.role !== "activity";

        return (
          <Box key={i} flexDirection="column">
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
      })}

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
