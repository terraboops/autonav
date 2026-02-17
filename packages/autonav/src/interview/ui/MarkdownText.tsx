/**
 * Markdown renderer for terminal output
 *
 * Wraps marked + marked-terminal to render markdown strings as
 * ANSI-styled terminal text within Ink components.
 */

import { useMemo } from "react";
import { Text, useStdout } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { matrixBrightness, boxChars } from "./theme.js";

interface MarkdownTextProps {
  /** Markdown content to render */
  content: string;
}

/** Bright green from theme for headers */
const headerColor = chalk.rgb(
  matrixBrightness.bright.r,
  matrixBrightness.bright.g,
  matrixBrightness.bright.b
);

const dimColor = chalk.gray;
const { single } = boxChars;

/**
 * Render a fenced code block with box-drawing borders and language label.
 *
 *   ┌─ typescript ──────────────────
 *   │ const x = 1;
 *   │ const y = 2;
 *   └───────────────────────────────
 */
function renderCodeBlock(code: string, lang: string | undefined, width: number): string {
  // Syntax-highlight the code
  let highlighted: string;
  try {
    highlighted = highlight(code, { language: lang });
  } catch {
    highlighted = code;
  }

  const codeLines = highlighted.split("\n");
  // Remove trailing empty line that marked often adds
  if (codeLines.length > 0 && (codeLines[codeLines.length - 1] ?? "").trim() === "") {
    codeLines.pop();
  }

  const innerWidth = Math.max(width - 6, 30);
  const langLabel = lang ? ` ${lang} ` : "";
  const topRule = langLabel
    ? single.horizontal + langLabel + single.horizontal.repeat(Math.max(0, innerWidth - langLabel.length - 1))
    : single.horizontal.repeat(innerWidth);
  const bottomRule = single.horizontal.repeat(innerWidth);

  const top = dimColor(`  ${single.topLeft}${topRule}`);
  const bottom = dimColor(`  ${single.bottomLeft}${bottomRule}`);
  const body = codeLines
    .map((line) => dimColor(`  ${single.vertical} `) + line)
    .join("\n");

  return `\n${top}\n${body}\n${bottom}\n`;
}

export function MarkdownText({ content }: MarkdownTextProps): React.ReactNode {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;

  const rendered = useMemo(() => {
    const contentWidth = terminalWidth - 4;
    // Configure marked with terminal renderer
    const instance = new Marked();
    instance.use(
      markedTerminal({
        reflowText: true,
        width: contentWidth,
        showSectionPrefix: false,
        tab: 2,
        emoji: false,
        // Theme headers with bright green
        firstHeading: (text: string) => headerColor.bold(`\n${text}\n`),
        heading: (text: string) => headerColor(`\n${text}\n`),
        // Yellow for inline code
        codespan: (text: string) => chalk.yellow(text),
        // Cyan for links
        link: (href: string, _title: string, text: string) =>
          chalk.cyan(text) + (href !== text ? chalk.gray(` (${href})`) : ""),
        // Gray italic for blockquotes
        blockquote: (quote: string) =>
          chalk.gray.italic(`  │ ${quote.trim().split("\n").join("\n  │ ")}\n`),
      })
    );

    // Fix: marked-terminal's text renderer doesn't parse inline tokens
    // (bold, italic, etc.) inside list items in marked v14+. Override
    // the text renderer to call parseInline when tokens are available.
    instance.use({
      renderer: {
        // Fix: marked-terminal's text renderer doesn't parse inline tokens
        // (bold, italic, etc.) inside list items in marked v14+.
        text(token: string | { text?: string; raw?: string; tokens?: unknown[] }) {
          if (typeof token === "object" && token.tokens) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (this as any).parser.parseInline(token.tokens);
          }
          return typeof token === "object"
            ? (token.text ?? token.raw ?? "")
            : String(token);
        },
        // Custom code block with box-drawing borders and language label
        code(token: string | { text?: string; lang?: string }) {
          const code = typeof token === "object" ? (token.text ?? "") : token;
          const lang = typeof token === "object" ? token.lang : undefined;
          return renderCodeBlock(code, lang, contentWidth);
        },
      },
    });

    const result = instance.parse(content, { async: false });
    // Trim trailing whitespace from marked output
    return (typeof result === "string" ? result : String(result)).trimEnd();
  }, [content, terminalWidth]);

  return <Text>{rendered}</Text>;
}
