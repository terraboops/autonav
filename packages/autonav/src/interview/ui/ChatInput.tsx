/**
 * Multiline chat input with word navigation and readline keybindings
 *
 * Replaces ink-text-input with a purpose-built component for chat UIs.
 *
 * Keybindings:
 *   Enter          — Submit message
 *   Ctrl+J         — Insert newline
 *   Left/Right     — Move cursor by character
 *   Option+Left    — Move cursor to previous word boundary
 *   Option+Right   — Move cursor to next word boundary
 *   Ctrl+A / Home  — Move to start of current line
 *   Ctrl+E / End   — Move to end of current line
 *   Ctrl+W         — Delete word backward
 *   Ctrl+U         — Delete to start of line
 *   Ctrl+K         — Delete to end of line
 *   Backspace      — Delete character backward
 *   Delete         — Delete character forward
 */

import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import chalk from "chalk";
import { colors } from "./theme.js";

interface ChatInputProps {
  /** Current input value (controlled) */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Called when user presses Enter to submit */
  onSubmit: (value: string) => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether input is active */
  focus?: boolean;
  /** Prompt string displayed before input */
  prompt?: string;
}

/** Find the start of the previous word from cursor position */
function wordBoundaryLeft(text: string, cursor: number): number {
  let pos = cursor - 1;
  // Skip whitespace
  while (pos > 0 && /\s/.test(text[pos - 1] ?? "")) pos--;
  // Skip word characters
  while (pos > 0 && /\S/.test(text[pos - 1] ?? "")) pos--;
  return Math.max(0, pos);
}

/** Find the end of the next word from cursor position */
function wordBoundaryRight(text: string, cursor: number): number {
  let pos = cursor;
  // Skip word characters
  while (pos < text.length && /\S/.test(text[pos] ?? "")) pos++;
  // Skip whitespace
  while (pos < text.length && /\s/.test(text[pos] ?? "")) pos++;
  return Math.min(text.length, pos);
}

/** Find start of current line relative to cursor */
function lineStart(text: string, cursor: number): number {
  const before = text.slice(0, cursor);
  const lastNewline = before.lastIndexOf("\n");
  return lastNewline + 1;
}

/** Find end of current line relative to cursor */
function lineEnd(text: string, cursor: number): number {
  const nextNewline = text.indexOf("\n", cursor);
  return nextNewline === -1 ? text.length : nextNewline;
}

/**
 * Split text into visual lines based on terminal width, tracking
 * which visual line the cursor is on and its column offset.
 */
function layoutLines(
  text: string,
  width: number,
  cursor: number,
  promptWidth: number
): { lines: string[]; cursorLine: number; cursorCol: number } {
  const lines: string[] = [];
  let cursorLine = 0;
  let cursorCol = 0;
  let charsSoFar = 0;

  const logicalLines = text.split("\n");
  for (let li = 0; li < logicalLines.length; li++) {
    const line = logicalLines[li] ?? "";
    // First logical line shares space with prompt
    const maxWidth = li === 0 ? width - promptWidth : width;

    if (line.length === 0) {
      // Track cursor on empty lines
      if (charsSoFar === cursor) {
        cursorLine = lines.length;
        cursorCol = li === 0 ? promptWidth : 0;
      }
      lines.push(line);
      charsSoFar++; // for the \n
      continue;
    }

    // Wrap long lines
    let start = 0;
    let isFirstWrap = true;
    while (start < line.length) {
      const wrapWidth = isFirstWrap ? maxWidth : width;
      const segment = line.slice(start, start + wrapWidth);
      lines.push(segment);

      // Check if cursor falls in this segment
      const segStart = charsSoFar;
      const segEnd = charsSoFar + segment.length;
      if (cursor >= segStart && cursor <= segEnd) {
        cursorLine = lines.length - 1;
        const offset = cursor - segStart;
        cursorCol = isFirstWrap && li === 0 ? promptWidth + offset : offset;
      }

      charsSoFar += segment.length;
      start += segment.length;
      isFirstWrap = false;
    }

    charsSoFar++; // for the \n between logical lines
  }

  // Handle cursor at very end
  if (cursor >= charsSoFar - 1 && cursor === text.length) {
    cursorLine = Math.max(0, lines.length - 1);
    const lastLine = lines[cursorLine] ?? "";
    cursorCol =
      logicalLines.length === 1 && lines.length === 1
        ? promptWidth + lastLine.length
        : lastLine.length;
  }

  return { lines, cursorLine, cursorCol };
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type a message...",
  focus = true,
  prompt = "▸ ",
}: ChatInputProps): React.ReactNode {
  const { stdout } = useStdout();
  const terminalWidth = (stdout?.columns ?? 80) - 2; // padding
  const [cursor, setCursor] = useState(value.length);

  // Keep cursor in bounds when value changes externally
  useEffect(() => {
    setCursor((prev) => Math.min(prev, value.length));
  }, [value]);

  const handleInput = useCallback(
    (input: string, key: {
      upArrow: boolean;
      downArrow: boolean;
      leftArrow: boolean;
      rightArrow: boolean;
      return: boolean;
      escape: boolean;
      ctrl: boolean;
      shift: boolean;
      meta: boolean;
      tab: boolean;
      backspace: boolean;
      delete: boolean;
    }) => {
      // Ignore when not focused
      if (!focus) return;

      // Skip Ctrl+C/D (handled by parent)
      if (key.ctrl && (input === "c" || input === "d")) return;

      // Submit on Enter
      if (key.return) {
        onSubmit(value);
        return;
      }

      let nextValue = value;
      let nextCursor = cursor;

      // --- Newline insertion ---
      // Ctrl+J sends name='enter' which ink maps to input='' with no key flags
      // We detect it via the raw check: when input is empty and no key flag is set
      // But ink strips it. Let's check for Shift+Return or handle Ctrl+J specially.
      // Actually, ink's parseKeypress maps \n to name='enter', and useInput
      // puts input='' for nonAlphanumericKeys. So we need to hook stdin directly
      // for Ctrl+J. Instead, let's use a pragmatic approach:
      // Ctrl+J: key.ctrl && input === 'j' (ink gives input = key.name for ctrl combos)
      if (key.ctrl && input === "j") {
        nextValue = value.slice(0, cursor) + "\n" + value.slice(cursor);
        nextCursor = cursor + 1;
        onChange(nextValue);
        setCursor(nextCursor);
        return;
      }

      // --- Word navigation ---
      // Option+Left (Mac) sends ESC b → key.meta=true, input='b'
      // Some terminals send ESC [1;3D → key.meta=true, key.leftArrow=true
      if ((key.meta && input === "b") || (key.leftArrow && key.meta)) {
        setCursor(wordBoundaryLeft(value, cursor));
        return;
      }
      // Option+Right (Mac) sends ESC f → key.meta=true, input='f'
      // Some terminals send ESC [1;3C → key.meta=true, key.rightArrow=true
      if ((key.meta && input === "f") || (key.rightArrow && key.meta)) {
        setCursor(wordBoundaryRight(value, cursor));
        return;
      }
      // Option+Delete (Mac) sends ESC DEL → word delete backward
      if (key.meta && key.delete) {
        const boundary = wordBoundaryLeft(value, cursor);
        nextValue = value.slice(0, boundary) + value.slice(cursor);
        nextCursor = boundary;
        onChange(nextValue);
        setCursor(nextCursor);
        return;
      }

      // --- Line navigation ---
      // Ctrl+A or Home: start of line
      if (key.ctrl && input === "a") {
        setCursor(lineStart(value, cursor));
        return;
      }
      // Ctrl+E or End: end of line
      if (key.ctrl && input === "e") {
        setCursor(lineEnd(value, cursor));
        return;
      }

      // --- Deletion ---
      // Ctrl+W: delete word backward
      if (key.ctrl && input === "w") {
        const boundary = wordBoundaryLeft(value, cursor);
        nextValue = value.slice(0, boundary) + value.slice(cursor);
        nextCursor = boundary;
        onChange(nextValue);
        setCursor(nextCursor);
        return;
      }
      // Ctrl+U: delete to start of line
      if (key.ctrl && input === "u") {
        const ls = lineStart(value, cursor);
        nextValue = value.slice(0, ls) + value.slice(cursor);
        nextCursor = ls;
        onChange(nextValue);
        setCursor(nextCursor);
        return;
      }
      // Ctrl+K: delete to end of line
      if (key.ctrl && input === "k") {
        const le = lineEnd(value, cursor);
        nextValue = value.slice(0, cursor) + value.slice(le);
        onChange(nextValue);
        return;
      }

      // --- Basic navigation ---
      if (key.leftArrow) {
        setCursor(Math.max(0, cursor - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor(Math.min(value.length, cursor + 1));
        return;
      }
      // Up/Down arrow: move between visual lines if multiline, else ignore
      if (key.upArrow || key.downArrow) {
        if (value.includes("\n")) {
          const lines = value.split("\n");
          // Find which logical line and offset cursor is at
          let pos = 0;
          let logLine = 0;
          for (let i = 0; i < lines.length; i++) {
            if (pos + (lines[i]?.length ?? 0) >= cursor) {
              logLine = i;
              break;
            }
            pos += (lines[i]?.length ?? 0) + 1;
          }
          const colInLine = cursor - pos;

          if (key.upArrow && logLine > 0) {
            // Move to previous logical line, same column
            let prevStart = 0;
            for (let i = 0; i < logLine - 1; i++) {
              prevStart += (lines[i]?.length ?? 0) + 1;
            }
            const prevLen = lines[logLine - 1]?.length ?? 0;
            setCursor(prevStart + Math.min(colInLine, prevLen));
            return;
          }
          if (key.downArrow && logLine < lines.length - 1) {
            // Move to next logical line, same column
            let nextStart = 0;
            for (let i = 0; i <= logLine; i++) {
              nextStart += (lines[i]?.length ?? 0) + 1;
            }
            const nextLen = lines[logLine + 1]?.length ?? 0;
            setCursor(nextStart + Math.min(colInLine, nextLen));
            return;
          }
        }
        return;
      }

      // --- Backspace / Delete ---
      // Ink maps Mac's backspace key (\x7f) to key.delete, not key.backspace.
      // Both key.backspace (\x08/Ctrl+H) and key.delete (\x7f) do backward
      // delete — this matches ink-text-input behavior and Mac expectations.
      if (key.backspace || key.delete) {
        if (cursor > 0) {
          nextValue = value.slice(0, cursor - 1) + value.slice(cursor);
          nextCursor = cursor - 1;
          onChange(nextValue);
          setCursor(nextCursor);
        }
        return;
      }

      // --- Tab, Escape, unhandled Meta combos: ignore ---
      if (key.tab || key.escape || key.meta) return;

      // --- Character input ---
      if (input && !key.ctrl) {
        nextValue = value.slice(0, cursor) + input + value.slice(cursor);
        nextCursor = cursor + input.length;
        onChange(nextValue);
        setCursor(nextCursor);
      }
    },
    [value, cursor, focus, onChange, onSubmit, terminalWidth, prompt.length]
  );

  useInput(handleInput, { isActive: focus });

  // --- Rendering ---
  const isEmpty = value.length === 0;
  const { lines, cursorLine, cursorCol } = layoutLines(
    isEmpty ? "" : value,
    terminalWidth,
    cursor,
    prompt.length
  );

  if (isEmpty) {
    // Show placeholder with cursor
    return (
      <Box>
        <Text color={colors.primary}>{prompt}</Text>
        <Text>
          {chalk.inverse(" ")}
          {chalk.gray(placeholder)}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const isFirstLine = i === 0;
        const isCursorLine = i === cursorLine;

        // Render the line with cursor
        let rendered = line;
        if (isCursorLine && focus) {
          const col = isFirstLine ? cursorCol - prompt.length : cursorCol;
          const before = line.slice(0, col);
          const cursorChar = line[col] ?? " ";
          const after = line.slice(col + 1);
          rendered = before + chalk.inverse(cursorChar) + after;
        }

        return (
          <Box key={i}>
            {isFirstLine ? (
              <Text>
                <Text color={colors.primary}>{prompt}</Text>
                {rendered}
              </Text>
            ) : (
              <Text>
                {" ".repeat(prompt.length)}
                {rendered}
              </Text>
            )}
          </Box>
        );
      })}
      {value.includes("\n") && (
        <Box>
          <Text color={colors.dimmed}>
            {"  "}Enter to send · Ctrl+J for newline
          </Text>
        </Box>
      )}
    </Box>
  );
}
