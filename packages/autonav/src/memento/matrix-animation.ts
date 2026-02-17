/**
 * Matrix-style Digital Rain Animation for CLI
 *
 * A non-React version of the matrix animation for use in pure CLI scripts.
 * Uses direct stdout writes with ANSI escape codes.
 */

import chalk from "chalk";

/** Glyph set: blocks and numbers */
const GLYPHS = [
  "░", "▒", "▓", "█", "▀", "▄", "■", "□",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "░", "▒", "▓", "█", "▀", "▄", "■", "□",
];

/** Color functions for green fade using terminal ANSI colors */
const COLORS = [
  chalk.greenBright,  // Bright
  chalk.green,        // Medium
  chalk.dim.green,    // Dim
  chalk.dim,          // Darkest
];

interface MatrixChar {
  char: string;
  brightness: number;
}

/**
 * Stats displayed in status line
 */
export interface AnimationStats {
  /** Current iteration number */
  iteration?: number;
  /** Max iterations (0 = unlimited) */
  maxIterations?: number;
  implementerModel?: string;
  navigatorModel?: string;
  lastTool?: string;
  linesAdded: number;
  linesRemoved: number;
  /** Implementer tokens for current iteration */
  tokensUsed: number;
  tokensMax: number;
  /** Tool call count for the current agent phase */
  turnCount: number;
}

/**
 * Get a random glyph
 */
function randomGlyph(): string {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "█";
}

/**
 * Calculate brightness based on position and time
 */
function calculateBrightness(position: number, tick: number, lineOffset: number): number {
  const wave = Math.sin((position + tick + lineOffset * 10) / 4);
  return Math.floor((wave + 1) * 1.5) % 4;
}

/**
 * Create a strip of matrix characters
 */
function createStrip(width: number, tick: number, lineOffset: number): MatrixChar[] {
  return Array.from({ length: width }, (_, i) => ({
    char: randomGlyph(),
    brightness: calculateBrightness(i, tick, lineOffset),
  }));
}

/**
 * Update strip with new brightness wave and random char changes
 */
function updateStrip(strip: MatrixChar[], tick: number, lineOffset: number): MatrixChar[] {
  return strip.map((item, i) => ({
    char: Math.random() < 0.2 ? randomGlyph() : item.char,
    brightness: calculateBrightness(i, tick, lineOffset),
  }));
}

/**
 * Render a strip to a colored string
 */
function renderStrip(strip: MatrixChar[]): string {
  return strip
    .map((item) => {
      const colorFn = COLORS[item.brightness] ?? COLORS[3];
      return colorFn!(item.char);
    })
    .join("");
}

/**
 * Truncate a string with ANSI codes to fit within a max visible width.
 * Preserves ANSI escape sequences while counting only visible characters.
 */
function truncateAnsi(str: string, maxWidth: number): string {
  const visibleLen = str.replace(/\x1B\[[0-9;]*m/g, "").length;
  if (visibleLen < maxWidth) return str;

  let visible = 0;
  let result = "";
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\x1B") {
      const end = str.indexOf("m", i);
      if (end !== -1) {
        result += str.substring(i, end + 1);
        i = end;
        continue;
      }
    }
    visible++;
    result += str[i];
    if (visible >= maxWidth) break;
  }
  return result + "\x1B[0m";
}

/**
 * Format a model name for display (shorten common model names)
 */
function formatModelName(model?: string): string {
  if (!model) return "--";
  // Shorten common model names for compactness
  return model
    .replace("claude-", "")
    .replace("-20250514", "")
    .replace("-20251101", "");
}

/**
 * Format stats for display
 */
function formatStats(stats: AnimationStats): string {
  const implModel = formatModelName(stats.implementerModel);
  const navModel = formatModelName(stats.navigatorModel);

  const tool = stats.lastTool ? chalk.cyan(stats.lastTool) : chalk.dim("--");
  const turns = stats.turnCount > 0 ? chalk.white(String(stats.turnCount)) : chalk.dim("0");

  // Diff stats (cumulative lines added/removed)
  const added = stats.linesAdded > 0 ? chalk.green(`+${stats.linesAdded}`) : chalk.dim("+0");
  const removed = stats.linesRemoved > 0 ? chalk.red(`-${stats.linesRemoved}`) : chalk.dim("-0");
  const diff = `${added}/${removed}`;

  // Iteration display
  const iter = stats.iteration
    ? stats.maxIterations
      ? chalk.white(`${stats.iteration}/${stats.maxIterations}`)
      : chalk.white(String(stats.iteration))
    : chalk.dim("--");

  return `${chalk.dim("Iter:")} ${iter}  ${chalk.dim("Impl:")} ${chalk.magenta(implModel)}  ${chalk.dim("Nav:")} ${chalk.blue(navModel)}  ${chalk.dim("Turns:")} ${turns}  ${chalk.dim("Diff:")} ${diff}  ${chalk.dim("Tool:")} ${tool}`;
}

/**
 * Matrix animation controller with status line
 */
export class MatrixAnimation {
  private strips: MatrixChar[][] = [];
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private message: string;
  private messageColor: (s: string) => string;
  private width: number;
  private lines: number;
  private interval: number;
  private stats: AnimationStats;
  private totalLines: number; // rain + message + status

  constructor(options: {
    message?: string;
    width?: number;
    lines?: number;
    interval?: number;
  } = {}) {
    this.message = options.message ?? "Processing...";
    this.messageColor = chalk.gray;
    this.width = options.width ?? 50;
    this.lines = options.lines ?? 3;
    this.interval = options.interval ?? 80;
    this.stats = {
      linesAdded: 0,
      linesRemoved: 0,
      tokensUsed: 0,
      tokensMax: 200000,
      turnCount: 0,
    };
    this.totalLines = this.lines + 1; // rain lines + status line

    // Initialize strips
    this.strips = Array.from({ length: this.lines }, (_, i) =>
      createStrip(this.width, 0, i)
    );
  }

  /**
   * Start the animation
   */
  start(): void {
    if (this.timer) return;

    // Reset tick so first render doesn't try to move cursor up
    // (important when restarting after stop → print → start)
    this.tick = 0;

    // Hide cursor
    process.stdout.write("\x1B[?25l");

    // Initial render
    this.render();

    // Start animation loop
    this.timer = setInterval(() => {
      this.tick += 1;
      this.strips = this.strips.map((strip, i) => updateStrip(strip, this.tick, i));
      this.render();
    }, this.interval);
  }

  /**
   * Update the message
   */
  setMessage(message: string): void {
    this.message = message;
  }

  /**
   * Set the color function for the message text
   */
  setMessageColor(color: (s: string) => string): void {
    this.messageColor = color;
  }

  /**
   * Update stats
   */
  setStats(stats: Partial<AnimationStats>): void {
    this.stats = { ...this.stats, ...stats };
  }

  /**
   * Update last tool
   */
  setLastTool(tool: string): void {
    this.stats.lastTool = tool;
  }

  /**
   * Set the model names for display
   */
  setModels(implementerModel: string, navigatorModel: string): void {
    this.stats.implementerModel = implementerModel;
    this.stats.navigatorModel = navigatorModel;
  }

  /**
   * Increment the turn counter (call on each tool_use)
   */
  incrementTurns(): void {
    this.stats.turnCount += 1;
  }

  /**
   * Reset turn counter (call when switching agent phases)
   */
  resetTurns(): void {
    this.stats.turnCount = 0;
  }

  /**
   * Add to line counts
   */
  addLines(added: number, removed: number): void {
    this.stats.linesAdded += added;
    this.stats.linesRemoved += removed;
  }

  /**
   * Update token usage
   */
  setTokens(used: number, max?: number): void {
    this.stats.tokensUsed = used;
    if (max !== undefined) {
      this.stats.tokensMax = max;
    }
  }

  /**
   * Get current stats
   */
  getStats(): AnimationStats {
    return { ...this.stats };
  }

  /**
   * Render current state
   */
  private render(): void {
    const cols = process.stdout.columns || 80;

    // Move cursor up to overwrite previous output
    if (this.tick > 0) {
      process.stdout.write(`\x1B[${this.totalLines}A`);
    }

    // Render rain lines
    for (let i = 0; i < this.lines; i++) {
      const strip = this.strips[i];
      if (!strip) continue;

      const rendered = renderStrip(strip);

      // Add message on last rain line
      if (i === this.lines - 1) {
        const line = `${rendered}  ${this.messageColor(this.message)}`;
        process.stdout.write(`\r${truncateAnsi(line, cols - 1)}\x1B[K\n`);
      } else {
        process.stdout.write(`\r${rendered}\x1B[K\n`);
      }
    }

    // Render status line (truncated to terminal width to prevent wrapping)
    const statsStr = formatStats(this.stats);
    process.stdout.write(`\r${truncateAnsi(statsStr, cols - 1)}\x1B[K\n`);
  }

  /**
   * Stop the animation and show final message
   */
  stop(finalMessage?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Move cursor up and clear lines
    process.stdout.write(`\x1B[${this.totalLines}A`);
    for (let i = 0; i < this.totalLines; i++) {
      process.stdout.write(`\r\x1B[K\n`);
    }
    process.stdout.write(`\x1B[${this.totalLines}A`);

    // Show cursor
    process.stdout.write("\x1B[?25h");

    // Print final message if provided
    if (finalMessage) {
      console.log(finalMessage);
    }
  }
}

/**
 * Run animation while a promise executes
 */
export async function withMatrixAnimation<T>(
  promise: Promise<T>,
  message: string
): Promise<T> {
  const animation = new MatrixAnimation({ message });
  animation.start();

  try {
    const result = await promise;
    animation.stop();
    return result;
  } catch (error) {
    animation.stop();
    throw error;
  }
}
