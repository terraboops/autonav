/**
 * Ink-based TUI for interactive navigator conversation
 *
 * Uses Harness abstraction for multi-turn conversation, supporting
 * both Claude Code and chibi runtimes.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { type Harness, type HarnessSession, ClaudeCodeHarness } from "../harness/index.js";
import { buildConversationSystemPrompt } from "./prompts.js";

// Check if debug mode is enabled
const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

// Model to use for conversation
const CONVERSATION_MODEL = "claude-sonnet-4-5";

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.error("[DEBUG]", ...args);
  }
}

interface Message {
  role: "user" | "assistant" | "system" | "activity";
  content: string;
}

interface ActivityState {
  type: "thinking" | "tool" | "reading" | "writing" | "searching";
  detail?: string;
}

interface ConversationAppProps {
  navigatorName: string;
  navigatorPath: string;
  navigatorSystemPrompt: string;
  knowledgeBasePath: string;
  harness?: Harness;
  mcpServers?: Record<string, unknown>;
}

export function ConversationApp({
  navigatorName,
  navigatorPath,
  navigatorSystemPrompt,
  knowledgeBasePath,
  harness,
  mcpServers,
}: ConversationAppProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<HarnessSession | null>(null);
  const harnessRef = useRef<Harness>(harness ?? new ClaudeCodeHarness());
  const { exit } = useApp();

  // Helper to determine activity type from tool name
  const getActivityFromTool = (toolName: string): ActivityState => {
    const name = toolName.toLowerCase();
    if (name.includes("read") || name === "cat") {
      return { type: "reading", detail: toolName };
    }
    if (name.includes("write") || name.includes("edit")) {
      return { type: "writing", detail: toolName };
    }
    if (name.includes("grep") || name.includes("glob") || name.includes("search") || name.includes("find")) {
      return { type: "searching", detail: toolName };
    }
    return { type: "tool", detail: toolName };
  };

  // Format activity for display
  const formatActivity = (act: ActivityState): string => {
    switch (act.type) {
      case "thinking":
        return "Thinking...";
      case "reading":
        return `Reading ${act.detail || "file"}...`;
      case "writing":
        return `Writing ${act.detail || "file"}...`;
      case "searching":
        return `Searching ${act.detail || ""}...`;
      case "tool":
        return `Running ${act.detail || "tool"}...`;
      default:
        return "Working...";
    }
  };

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

      for await (const event of events) {
        debugLog("Received event type:", event.type);

        if (event.type === "tool_use") {
          const toolActivity = getActivityFromTool(event.name);
          setActivity(toolActivity);

          setMessages((prev) => [
            ...prev,
            { role: "activity", content: `\u2699\uFE0F ${event.name}` },
          ]);
        } else if (event.type === "text") {
          if (event.text) {
            setActivity({ type: "thinking" });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: event.text },
            ]);
          }
        } else if (event.type === "result") {
          debugLog("Result received:", event.success);
          break;
        }
      }

      setActivity(null);
      setIsLoading(false);
    } catch (err) {
      debugLog("Error processing response:", err);
      setError(
        err instanceof Error ? err.message : "Error communicating with Claude"
      );
      setActivity(null);
      setIsLoading(false);
    }
  }, [getActivityFromTool]);

  // Send initial greeting
  useEffect(() => {
    setMessages([
      {
        role: "system",
        content: `Connected to ${navigatorName}. Type /help for commands, or start chatting.`,
      },
    ]);
  }, [navigatorName]);

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

  // Handle Ctrl+C or Ctrl+D to exit
  useInput((input, key) => {
    if (key.ctrl && (input === "c" || input === "d")) {
      if (sessionRef.current) {
        sessionRef.current.close().catch(() => {});
      }
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {"\uD83D\uDCAC"} {navigatorName}
        </Text>
        <Text color="gray"> - conversation mode</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          Type /help for commands. Press Ctrl+C or Ctrl+D to exit.
        </Text>
      </Box>

      {/* Conversation history */}
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1} flexDirection="column">
          {msg.role === "user" ? (
            <Box>
              <Text color="green">{"you \u203A "}</Text>
              <Text>{msg.content}</Text>
            </Box>
          ) : msg.role === "assistant" ? (
            <Box flexDirection="column">
              <Text color="blue">{navigatorName}:</Text>
              <Box marginLeft={2}>
                <Text>{msg.content}</Text>
              </Box>
            </Box>
          ) : msg.role === "activity" ? (
            <Box>
              <Text color="yellow" dimColor>
                {msg.content}
              </Text>
            </Box>
          ) : (
            <Box>
              <Text color="gray" dimColor>
                {msg.content}
              </Text>
            </Box>
          )}
        </Box>
      ))}

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Loading indicator */}
      {isLoading && activity && (
        <Box marginBottom={1}>
          <Text color="cyan">{formatActivity(activity)}</Text>
        </Box>
      )}

      {/* Input */}
      {!isLoading && (
        <Box>
          <Text color="green">{"you \u203A "}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
          />
        </Box>
      )}
    </Box>
  );
}
