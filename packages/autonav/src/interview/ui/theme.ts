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

/** Matrix-style glyph sets for animated activity indicator */

// A. Classic Mix: Letters + Numbers + Symbols + Blocks
export const glyphSetA = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  ":", ".", "=", "*", "+", "-", "<", ">", "|", "/", "\\", "^", "~", "_",
  "│", "─", "┤", "┐", "└", "┴", "┬", "├", "┼", "┘", "┌",
  "░", "▒", "▓", "█", "▀", "▄", "■", "□",
] as const;

// B. Block Heavy: Mostly blocks and symbols
export const glyphSetB = [
  "░", "▒", "▓", "█", "▀", "▄", "■", "□", "▪", "▫",
  "░", "▒", "▓", "█", "▀", "▄", "■", "□", "▪", "▫", // Repeat for density
  "│", "─", "║", "═", "╬", "╪", "┼", "╔", "╗", "╚", "╝",
  ":", ".", "*", "#", "@", "$", "%", "&", "=", "+", "-",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;

// C. Numbers + Symbols: Digital/binary feel
export const glyphSetC = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", // More numbers
  ":", ".", "=", "*", "+", "-", "<", ">", "|", "/", "\\",
  "░", "▒", "▓", "█",
  "#", "@", "$", "%", "&", "^", "~",
] as const;

// D. Box Drawing: Geometric/architectural
export const glyphSetD = [
  "│", "─", "┤", "┐", "└", "┴", "┬", "├", "┼", "┘", "┌",
  "║", "═", "╬", "╪", "╔", "╗", "╚", "╝", "╠", "╣", "╦", "╩",
  "│", "─", "┤", "┐", "└", "┴", "┬", "├", "┼", "┘", "┌", // Repeat
  "░", "▒", "▓", "█", "▀", "▄",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;

// E. Minimal: Just blocks and numbers
export const glyphSetE = [
  "░", "▒", "▓", "█", "▀", "▄", "■", "□",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "░", "▒", "▓", "█", "▀", "▄", "■", "□", // Repeat for more blocks
] as const;

// Default export for backwards compatibility
export const matrixGlyphs = glyphSetA;

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
