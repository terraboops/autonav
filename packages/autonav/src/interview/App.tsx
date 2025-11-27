/**
 * Ink-based TUI for interactive nav init interview
 *
 * Uses Claude Agent SDK for authentication (leverages Claude Code's OAuth)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import {
  getInterviewSystemPrompt,
  parseNavigatorConfig,
  type NavigatorConfig,
  type PackContext,
} from "./prompts.js";

// Check if debug mode is enabled
const DEBUG = process.env.AUTONAV_DEBUG === "1" || process.env.DEBUG === "1";

// Model to use for interview
const INTERVIEW_MODEL = "claude-sonnet-4-5";

function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.error("[DEBUG]", ...args);
  }
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface InterviewAppProps {
  name: string;
  packContext?: PackContext;
  onComplete: (config: NavigatorConfig) => void;
}

export function InterviewApp({ name, packContext, onComplete }: InterviewAppProps) {
  // Get the system prompt, customized for pack if provided
  const systemPrompt = getInterviewSystemPrompt(packContext);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef<Query | null>(null);
  const completedRef = useRef(false);
  const { exit } = useApp();

  // Process messages from Claude
  const processResponse = useCallback(async () => {
    const queryInstance = queryRef.current;
    if (!queryInstance || completedRef.current) return;

    try {
      debugLog("Waiting for Claude response...");
      let fullText = "";

      for await (const message of queryInstance) {
        debugLog("Received message type:", message.type);

        if (message.type === "assistant") {
          // Extract text content from the assistant message
          const content = message.message.content;
          const textBlocks = content.filter(
            (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
          );
          const text = textBlocks.map((b) => b.text).join("\n");

          if (text) {
            fullText = text;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: text },
            ]);
          }
        } else if (message.type === "result") {
          debugLog("Result received:", message.subtype);
          // Query completed, check if we got a config
          break;
        }
      }

      // Check if the response contains a navigator config
      if (fullText) {
        const config = parseNavigatorConfig(fullText);
        if (config) {
          debugLog("Interview complete, config parsed");
          completedRef.current = true;
          onComplete(config);
          return;
        }
      }

      setIsLoading(false);
    } catch (err) {
      debugLog("Error processing response:", err);
      setError(
        err instanceof Error ? err.message : "Error communicating with Claude"
      );
      setIsLoading(false);
    }
  }, [onComplete]);

  // Initialize query and send first message
  useEffect(() => {
    const initQuery = async () => {
      try {
        debugLog("Creating query with model:", INTERVIEW_MODEL);

        // Create initial prompt
        const initialMessage = `I want to create a navigator called "${name}".`;
        debugLog("Initial message:", initialMessage);

        // Create query with system prompt
        const queryInstance = query({
          prompt: initialMessage,
          options: {
            model: INTERVIEW_MODEL,
            systemPrompt,
            permissionMode: "bypassPermissions",
          },
        });

        queryRef.current = queryInstance;
        debugLog("Query created");

        // Process response
        await processResponse();
      } catch (err) {
        debugLog("Query initialization error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize Claude query"
        );
        setIsLoading(false);
      }
    };

    initQuery();
  }, [name, processResponse]);

  // Handle user input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isLoading || completedRef.current) return;

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: value }]);
      setIsLoading(true);

      try {
        debugLog("Sending user message:", value);

        // Create a new query for each turn
        // Include conversation history in the prompt with clear separation
        const conversationHistory = messages
          .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
          .join("\n\n");

        const fullPrompt = `<conversation_history>
${conversationHistory}
</conversation_history>

The user just responded with:
<user_message>
${value}
</user_message>

Continue the interview by responding to their message. Ask your next question OR if you have enough information, output the JSON configuration. Do NOT simulate user responses - only provide YOUR response as the assistant.`;

        const queryInstance = query({
          prompt: fullPrompt,
          options: {
            model: INTERVIEW_MODEL,
            systemPrompt,
            permissionMode: "bypassPermissions",
          },
        });

        queryRef.current = queryInstance;
        await processResponse();
      } catch (err) {
        debugLog("Error sending message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsLoading(false);
      }
    },
    [isLoading, messages, processResponse]
  );

  // Handle Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🧭 Creating navigator: {name}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          Answer the questions below. Press Ctrl+C to cancel.
        </Text>
      </Box>

      {/* Conversation history */}
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1} flexDirection="column">
          {msg.role === "user" ? (
            <Box>
              <Text color="green">{"› "}</Text>
              <Text>{msg.content}</Text>
            </Box>
          ) : (
            <Box>
              <Text color="white">{msg.content}</Text>
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
      {isLoading && (
        <Box marginBottom={1}>
          <Text color="gray">Thinking...</Text>
        </Box>
      )}

      {/* Input */}
      {!isLoading && !error && (
        <Box>
          <Text color="green">{"› "}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type your response..."
          />
        </Box>
      )}
    </Box>
  );
}
