/**
 * Ambient type declarations for marked-terminal
 *
 * marked-terminal doesn't ship its own types.
 */

declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";

  export interface TerminalRendererOptions {
    code?: (code: string, lang?: string) => string;
    blockquote?: (quote: string) => string;
    html?: (html: string) => string;
    heading?: (text: string, level: number) => string;
    firstHeading?: (text: string, level: number) => string;
    hr?: () => string;
    list?: (body: string, ordered: boolean) => string;
    listitem?: (text: string) => string;
    table?: (header: string, body: string) => string;
    paragraph?: (text: string) => string;
    strong?: (text: string) => string;
    em?: (text: string) => string;
    codespan?: (text: string) => string;
    del?: (text: string) => string;
    link?: (href: string, title: string, text: string) => string;
    image?: (href: string, title: string, text: string) => string;
    reflowText?: boolean;
    width?: number;
    showSectionPrefix?: boolean;
    tab?: number;
    emoji?: boolean;
    unescape?: boolean;
  }

  export interface HighlightOptions {
    language?: string;
    theme?: Record<string, unknown>;
  }

  export function markedTerminal(
    options?: TerminalRendererOptions,
    highlightOptions?: HighlightOptions
  ): MarkedExtension;

  export default class TerminalRenderer {
    constructor(options?: TerminalRendererOptions);
  }
}
