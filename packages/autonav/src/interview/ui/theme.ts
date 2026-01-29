/**
 * Theme configuration for cyberpunk glitch UI
 *
 * Provides colors, characters, and glyphs for the interview TUI
 */

/** Color palette */
export const colors = {
  primary: "green",
  accent: "cyan",
  dimmed: "gray",
  error: "red",
  warning: "yellow",
} as const;

/** Box-drawing characters */
export const boxChars = {
  // Double-line borders
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
    leftT: "╠",
    rightT: "╣",
  },
  // Single-line borders
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
    leftT: "├",
    rightT: "┤",
  },
  // Rounded borders
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
} as const;

/** Glitch block characters for decorations */
export const glitchBlocks = ["░", "▒", "▓", "█"] as const;

/** Matrix-style glyphs for animated activity indicator */
// Authentic Matrix characters: halfwidth katakana + numbers + symbols
export const matrixGlyphs = [
  // Halfwidth katakana (most authentic to The Matrix)
  "ｦ", "ｧ", "ｨ", "ｩ", "ｪ", "ｫ", "ｬ", "ｭ", "ｮ", "ｯ",
  "ｰ", "ｱ", "ｲ", "ｳ", "ｴ", "ｵ", "ｶ", "ｷ", "ｸ", "ｹ",
  "ｺ", "ｻ", "ｼ", "ｽ", "ｾ", "ｿ", "ﾀ", "ﾁ", "ﾂ", "ﾃ",
  "ﾄ", "ﾅ", "ﾆ", "ﾇ", "ﾈ", "ﾉ", "ﾊ", "ﾋ", "ﾌ", "ﾍ",
  "ﾎ", "ﾏ", "ﾐ", "ﾑ", "ﾒ", "ﾓ", "ﾔ", "ﾕ", "ﾖ", "ﾗ",
  "ﾘ", "ﾙ", "ﾚ", "ﾛ", "ﾜ", "ﾝ",
  // Numbers
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  // Symbols
  ":", ".", "=", "*", "+", "-", "<", ">", "¦", "｜",
] as const;

/** Brightness levels for Matrix fade effect */
export const matrixBrightness = {
  // RGB values for green fade: bright → medium → dark
  bright: { r: 0, g: 255, b: 70 },   // Bright white-green
  medium: { r: 0, g: 190, b: 0 },    // Medium green
  dim: { r: 0, g: 100, b: 0 },       // Dark green
  darkest: { r: 0, g: 40, b: 0 },    // Nearly black
} as const;

/** Block-letter alphabet for ASCII art headers */
export const blockLetters = {
  A: ["▄▀█", "█▀█"],
  U: ["█░█", "█▄█"],
  T: ["▀█▀", "░█░"],
  O: ["█▀█", "█▄█"],
  N: ["█▄░█", "█░▀█"],
  V: ["█░█", "▀▄▀"],
  C: ["█▀▀", "█░░", "▀▀▀"],
  R: ["█▀█", "█▀▄", "▀░▀"],
  E: ["█▀▀", "█▀▀", "▀▀▀"],
  D: ["█▀▄", "█░█", "▀▀░"],
  // Add more as needed
} as const;
