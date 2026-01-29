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

/** Steps for config generation with user-friendly labels */
const CONFIG_GENERATION_STEPS = [
  { key: "purpose", label: "Defining purpose..." },
  { key: "scope", label: "Setting scope..." },
  { key: "knowledgeStructure", label: "Organizing knowledge structure..." },
  { key: "audience", label: "Identifying audience..." },
  { key: "autonomy", label: "Configuring autonomy..." },
  { key: "directories", label: "Suggesting directories..." },
  { key: "claudeMd", label: "Generating CLAUDE.md..." },
] as const;

/**
 * Generate navigator config fields via separate LLM calls.
 *
 * This avoids the nested backtick problem where claudeMd contains markdown
 * with code blocks that break the JSON extraction regex.
 */
async function generateConfigFields(
  conversationHistory: string,
  systemPrompt: string,
  name: string,
  onProgress: (step: number, label: string) => void
): Promise<NavigatorConfig> {
  // Helper to make a single-field extraction call
  const extractField = async (fieldPrompt: string): Promise<string> => {
    const q = query({
      prompt: `<conversation>\n${conversationHistory}\n</conversation>\n\n${fieldPrompt}`,
      options: {
        model: INTERVIEW_MODEL,
        systemPrompt,
        permissionMode: "bypassPermissions",
      },
    });

    let result = "";
    for await (const message of q) {
      if (message.type === "assistant") {
        const textBlocks = message.message.content.filter(
          (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
        );
        result = textBlocks.map((b) => b.text).join("\n");
      }
    }
    return result.trim();
  };

  debugLog("Generating config fields separately...");

  // Generate required fields
  onProgress(1, CONFIG_GENERATION_STEPS[0].label);
  debugLog("  - Extracting purpose...");
  const purpose = await extractField(
    "Based on the conversation, output ONLY a single sentence describing the navigator's purpose. No explanation, just the purpose statement."
  );

  onProgress(2, CONFIG_GENERATION_STEPS[1].label);
  debugLog("  - Extracting scope...");
  const scope = await extractField(
    "Based on the conversation, output ONLY a brief description of what is IN SCOPE and OUT OF SCOPE. Format: 'IN SCOPE: ... OUT OF SCOPE: ...'"
  );

  // Generate optional fields
  onProgress(3, CONFIG_GENERATION_STEPS[2].label);
  debugLog("  - Extracting knowledgeStructure...");
  const knowledgeStructure = await extractField(
    "Based on the conversation, describe how knowledge should be organized for this navigator. Output ONLY the description, 1-3 sentences. If not discussed, output 'default'."
  );

  onProgress(4, CONFIG_GENERATION_STEPS[3].label);
  debugLog("  - Extracting audience...");
  const audience = await extractField(
    "Based on the conversation, describe who the navigator serves and how communication style should adapt. Output ONLY the description. If not discussed, output 'default'."
  );

  onProgress(5, CONFIG_GENERATION_STEPS[4].label);
  debugLog("  - Extracting autonomy...");
  const autonomy = await extractField(
    "Based on the conversation, describe the navigator's level of autonomous action (e.g., 'fully autonomous', 'ask before changes', etc.). Output ONLY the description. If not discussed, output 'default'."
  );

  onProgress(6, CONFIG_GENERATION_STEPS[5].label);
  debugLog("  - Extracting suggestedDirectories...");
  const suggestedDirsRaw = await extractField(
    "Based on the conversation, list the suggested directories for this navigator as a comma-separated list (e.g., 'knowledge, projects, archive'). Output ONLY the comma-separated list. If not discussed, output 'knowledge'."
  );

  // Generate claudeMd last (largest field)
  onProgress(7, CONFIG_GENERATION_STEPS[6].label);
  debugLog("  - Generating claudeMd...");
  const claudeMd = await extractField(
    `Generate the complete CLAUDE.md file for the "${name}" navigator based on the conversation. Output ONLY the raw markdown content, starting with "# ${name}". Include sections for: Purpose, Critical Boundaries (if any), Scope, Knowledge Structure, Communication Style, Grounding Rules, and Autonomy. Make it comprehensive based on everything discussed.`
  );

  // Parse suggestedDirectories from comma-separated string
  const suggestedDirectories = suggestedDirsRaw
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && d !== "default");

  debugLog("Config fields generated successfully");

  return {
    purpose,
    scope,
    claudeMd,
    // Only include optional fields if they have meaningful values
    ...(knowledgeStructure !== "default" && { knowledgeStructure }),
    ...(audience !== "default" && { audience }),
    ...(autonomy !== "default" && { autonomy }),
    ...(suggestedDirectories.length > 0 && { suggestedDirectories }),
  };
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
  // Don't start loading when resuming - we already have messages to display
  const [isLoading, setIsLoading] = useState(!initialMessages?.length);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionStep, setCompletionStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
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
          // Defer onComplete to next tick to avoid render race conditions
          // This ensures the component finishes its current render before unmounting
          setTimeout(() => onComplete(config), 0);
          debugLog("onComplete scheduled, should be exiting soon");
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
    // Skip initialization when resuming - we already have messages
    if (initialMessages?.length) {
      debugLog("Resuming from saved progress with", initialMessages.length, "messages");
      return;
    }

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
  }, [name, processResponse, initialMessages]);

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

      // Fast path: when user says "done", check if any recent assistant message already has valid config
      // This handles the race condition where Claude generated valid JSON but the interview didn't exit
      if (isDoneCommand) {
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        // Check the last 3 assistant messages for a valid config
        for (let i = assistantMessages.length - 1; i >= Math.max(0, assistantMessages.length - 3); i--) {
          const msg = assistantMessages[i];
          if (!msg) continue;
          const config = parseNavigatorConfig(msg.content);
          if (config) {
            debugLog("Fast path: found valid config in existing message, exiting");
            completedRef.current = true;
            clearProgress(navigatorPath);
            setTimeout(() => onComplete(config), 0);
            return;
          }
        }
        debugLog("Fast path: no existing config found, generating fields separately");

        // Generate config fields via separate LLM calls to avoid nested backtick issues
        setInput("");
        setIsCompleting(true);
        setIsLoading(true);
        setCompletionStep(CONFIG_GENERATION_STEPS[0].label);

        try {
          const conversationHistory = messages
            .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
            .join("\n\n");

          const config = await generateConfigFields(
            conversationHistory,
            systemPrompt,
            name,
            (_step, label) => setCompletionStep(label)
          );

          completedRef.current = true;
          clearProgress(navigatorPath);
          setTimeout(() => onComplete(config), 0);
          return;
        } catch (err) {
          debugLog("Error generating config fields:", err);
          setError(err instanceof Error ? err.message : "Failed to generate config");
          setIsLoading(false);
          setIsCompleting(false);
          setCompletionStep(null);
        }
        return; // Don't fall through to normal conversation flow
      }

      setInput("");
      const newMessages: Message[] = [...messages, { role: "user" as const, content: value }];
      setMessages(newMessages);
      setIsLoading(true);

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

        // Normal conversation flow
        const fullPrompt = `<conversation_history>
${conversationHistory}
</conversation_history>

The user just responded with:
<user_message>
${value}
</user_message>

Continue the interview by responding to their message. Remember: after gathering enough information (usually 4-6 exchanges), you should signal that you're ready to create the navigator and wait for the user to type 'done'. Do NOT output the JSON configuration until the user explicitly says they're ready. Do NOT simulate user responses - only provide YOUR response as the assistant.`;

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
    [isLoading, messages, systemPrompt, processResponse, name, navigatorPath, packContext, analysisContext, onComplete]
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
          <Text color={isCompleting ? "cyan" : "gray"}>
            {isCompleting && completionStep ? completionStep : isCompleting ? "Completing interview..." : "Thinking..."}
          </Text>
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
