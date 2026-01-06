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
import type { AnalysisResult } from "../repo-analyzer/index.js";
import { saveProgress, clearProgress, type InterviewProgress } from "./progress.js";

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
  navigatorPath: string;
  packContext?: PackContext;
  analysisContext?: AnalysisResult;
  initialMessages?: Message[];
  onComplete: (config: NavigatorConfig) => void;
}

export function InterviewApp({
  name,
  navigatorPath,
  packContext,
  analysisContext,
  initialMessages,
  onComplete,
}: InterviewAppProps) {
  // Get the system prompt, customized for pack or analysis if provided
  const systemPrompt = getInterviewSystemPrompt(packContext, analysisContext);
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const queryRef = useRef<Query | null>(null);
  const completedRef = useRef(false);
  const consecutiveDone = useRef(0);
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
            setMessages((prev) => {
              const newMessages: Message[] = [
                ...prev,
                { role: "assistant" as const, content: text },
              ];
              // Save progress after assistant message
              try {
                const progress: InterviewProgress = {
                  navigatorName: name,
                  messages: newMessages,
                  packContext,
                  analysisContext,
                  lastSaved: new Date().toISOString(),
                };
                saveProgress(navigatorPath, progress);
                debugLog("Progress saved after assistant message:", newMessages.length, "messages");
              } catch (err) {
                debugLog("Failed to save progress:", err);
              }
              return newMessages;
            });
          }
        } else if (message.type === "result") {
          debugLog("Result received:", message.subtype);
          // Query completed, check if we got a config
          break;
        }
      }

      // Check if the response contains a navigator config
      if (fullText) {
        debugLog("Checking for navigator config in response...");
        const config = parseNavigatorConfig(fullText);
        if (config) {
          debugLog("✓ Interview complete! Config parsed successfully");
          debugLog("  - purpose:", config.purpose?.substring(0, 50) + "...");
          debugLog("  - Calling onComplete to exit...");
          completedRef.current = true;
          // Clear progress file on successful completion
          try {
            clearProgress(navigatorPath);
            debugLog("Progress cleared");
          } catch (err) {
            debugLog("Failed to clear progress:", err);
          }
          onComplete(config);
          debugLog("onComplete called, should be exiting now");
          return;
        } else {
          debugLog("✗ No valid config found in response (or validation failed)");
          debugLog("  Response preview:", fullText.substring(0, 200));
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
  }, [onComplete, name, navigatorPath, packContext, analysisContext]);

  // Initialize query and send first message
  useEffect(() => {
    const initQuery = async () => {
      try {
        debugLog("Creating query with model:", INTERVIEW_MODEL);

        // Build initial message with analysis context if available
        let initialMessage = `I want to create a navigator called "${name}".`;

        if (analysisContext) {
          initialMessage += `\n\nI've already analyzed the repository and found:\n`;
          initialMessage += `- Purpose: ${analysisContext.purpose}\n`;
          initialMessage += `- Scope: ${analysisContext.scope}\n`;
          initialMessage += `- Audience: ${analysisContext.audience}\n`;
          if (analysisContext.suggestedKnowledgePaths.length > 0) {
            initialMessage += `- Knowledge paths: ${analysisContext.suggestedKnowledgePaths.join(", ")}\n`;
          }
          initialMessage += `\nI'd like to refine these details before creating the navigator.`;
        }

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

  // Show hint after 5+ user messages
  useEffect(() => {
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount >= 5 && !showHint) {
      setShowHint(true);
    }
  }, [messages, showHint]);

  // Handle user input submission
  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isLoading || completedRef.current) return;

      // Detect 'done' command - case-insensitive, trimmed
      const normalizedInput = value.trim().toLowerCase();
      const isDoneCommand = ['done', 'finish', 'ready', 'create'].includes(normalizedInput);

      setInput("");
      const newMessages: Message[] = [...messages, { role: "user" as const, content: value }];
      setMessages(newMessages);
      setIsLoading(true);

      // Update consecutive done tracking
      if (isDoneCommand) {
        consecutiveDone.current += 1;
      } else {
        consecutiveDone.current = 0;
      }

      // Save progress after user input
      try {
        const progress: InterviewProgress = {
          navigatorName: name,
          messages: newMessages,
          packContext,
          analysisContext,
          lastSaved: new Date().toISOString(),
        };
        saveProgress(navigatorPath, progress);
        debugLog("Progress saved after user input:", newMessages.length, "messages");
      } catch (err) {
        debugLog("Failed to save progress:", err);
        // Don't block on save failures
      }

      try {
        debugLog("Sending user message:", value);

        // Build conversation history
        const conversationHistory = messages
          .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
          .join("\n\n");

        // Modify prompt based on 'done' command
        let fullPrompt: string;

        if (isDoneCommand) {
          // User wants to finish - FORCE config generation
          const urgency = consecutiveDone.current > 1
            ? "The user has REPEATEDLY indicated they are ready. You MUST generate the configuration NOW, even if it's basic or has gaps. Work with what you have."
            : "The user has indicated they are ready to create the navigator by typing \"" + value + "\".";

          fullPrompt = `<conversation_history>
${conversationHistory}
</conversation_history>

${urgency}

CRITICAL: You MUST now generate the JSON configuration based on the information gathered so far. Even if you would prefer more details, work with what you have.

Output ONLY the JSON configuration block wrapped in \`\`\`json and \`\`\` markers. DO NOT add any text before or after the JSON block. DO NOT provide explanations, summaries, or ask for confirmation. The JSON itself is your complete and final response.

If you truly don't have enough information to create a basic configuration (e.g., only 1-2 exchanges with no meaningful detail), explain what critical information is missing and ask ONE final clarifying question. Otherwise, generate ONLY the JSON configuration block and nothing else.`;
        } else {
          // Normal conversation flow
          fullPrompt = `<conversation_history>
${conversationHistory}
</conversation_history>

The user just responded with:
<user_message>
${value}
</user_message>

Continue the interview by responding to their message. Remember: after gathering enough information (usually 4-6 exchanges), you should signal that you're ready to create the navigator and wait for the user to type 'done'. Do NOT output the JSON configuration until the user explicitly says they're ready. Do NOT simulate user responses - only provide YOUR response as the assistant.`;
        }

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
    [isLoading, messages, systemPrompt, processResponse, name, navigatorPath, packContext, analysisContext]
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

      {/* Hint after 5+ exchanges */}
      {showHint && !isLoading && !error && (
        <Box marginBottom={1}>
          <Text color="yellow">💡 Tip: Type 'done' when ready to create your navigator</Text>
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
