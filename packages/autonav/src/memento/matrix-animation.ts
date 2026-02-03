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

/** Brightness levels (RGB) for green fade */
const BRIGHTNESS = [
  { r: 0, g: 255, b: 70 },   // Bright
  { r: 0, g: 190, b: 0 },    // Medium
  { r: 0, g: 100, b: 0 },    // Dim
  { r: 0, g: 40, b: 0 },     // Darkest
];

/** Color functions for each brightness level */
const COLORS = BRIGHTNESS.map(({ r, g, b }) => chalk.rgb(r, g, b));

interface MatrixChar {
  char: string;
  brightness: number;
}

/**
 * Stats displayed in status line
 */
export interface AnimationStats {
  lastTool?: string;
  linesAdded: number;
  linesRemoved: number;
  tokensUsed: number;
  tokensMax: number;
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
 * Format stats for display
 */
function formatStats(stats: AnimationStats): string {
  const tool = stats.lastTool ? chalk.cyan(stats.lastTool) : chalk.dim("--");

  const added = stats.linesAdded > 0 ? chalk.green(`+${stats.linesAdded}`) : chalk.dim("+0");
  const removed = stats.linesRemoved > 0 ? chalk.red(`-${stats.linesRemoved}`) : chalk.dim("-0");
  const diff = `${added}/${removed}`;

  const tokenPct = stats.tokensMax > 0
    ? Math.round((stats.tokensUsed / stats.tokensMax) * 100)
    : 0;
  const tokenColor = tokenPct > 80 ? chalk.red : tokenPct > 50 ? chalk.yellow : chalk.green;
  const tokens = `${tokenColor(stats.tokensUsed.toLocaleString())}/${chalk.dim(stats.tokensMax.toLocaleString())}`;

  return `${chalk.dim("Tool:")} ${tool}  ${chalk.dim("Diff:")} ${diff}  ${chalk.dim("Tokens:")} ${tokens}`;
}

/**
 * Matrix animation controller with status line
 */
export class MatrixAnimation {
  private strips: MatrixChar[][] = [];
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private message: string;
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
    this.width = options.width ?? 50;
    this.lines = options.lines ?? 3;
    this.interval = options.interval ?? 80;
    this.stats = {
      linesAdded: 0,
      linesRemoved: 0,
      tokensUsed: 0,
      tokensMax: 200000, // Default Claude context
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
        process.stdout.write(`\r${rendered}  ${chalk.gray(this.message)}\x1B[K\n`);
      } else {
        process.stdout.write(`\r${rendered}\x1B[K\n`);
      }
    }

    // Render status line
    process.stdout.write(`\r${formatStats(this.stats)}\x1B[K\n`);
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
