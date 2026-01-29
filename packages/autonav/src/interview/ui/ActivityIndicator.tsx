/**
 * Matrix-style animated activity indicator
 *
 * Displays horizontal strips with Matrix digital rain aesthetics:
 * - Block and numeric glyphs
 * - Brightness wave effect (bright green to dark green)
 * - Randomly cycling characters
 */

import { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import { matrixBrightness, colors, glyphSetE } from "./theme.js";

interface ActivityIndicatorProps {
  /** Message to display next to the indicator */
  message?: string;
  /** Width of the indicator in characters */
  width?: number;
  /** Update interval in milliseconds */
  interval?: number;
  /** Number of lines to display */
  lines?: number;
  /** Custom glyph set to use */
  glyphSet?: readonly string[];
}

/** Character with brightness level (0=bright, 3=darkest) */
interface MatrixChar {
  char: string;
  brightness: number;
}

/**
 * Get a random glyph from the set
 */
function randomGlyph(glyphSet: readonly string[]): string {
  const index = Math.floor(Math.random() * glyphSet.length);
  return glyphSet[index] ?? "█";
}

/**
 * Calculate brightness based on position and time
 */
function calculateBrightness(position: number, tick: number, lineOffset: number): number {
  const wave = Math.sin((position + tick + lineOffset * 10) / 4);
  return Math.floor((wave + 1) * 1.5) % 4;
}

/**
 * Create initial strip of characters
 */
function createStrip(
  width: number,
  glyphSet: readonly string[],
  tick: number,
  lineOffset: number
): MatrixChar[] {
  return Array.from({ length: width }, (_, i) => ({
    char: randomGlyph(glyphSet),
    brightness: calculateBrightness(i, tick, lineOffset),
  }));
}

/**
 * Update strip: recalculate brightness wave, randomly change some characters
 */
function updateStrip(
  strip: MatrixChar[],
  tick: number,
  glyphSet: readonly string[],
  lineOffset: number
): MatrixChar[] {
  return strip.map((item, i) => ({
    char: Math.random() < 0.2 ? randomGlyph(glyphSet) : item.char,
    brightness: calculateBrightness(i, tick, lineOffset),
  }));
}

/** Chalk color functions for each brightness level */
const brightnessColors = [
  chalk.rgb(matrixBrightness.bright.r, matrixBrightness.bright.g, matrixBrightness.bright.b),
  chalk.rgb(matrixBrightness.medium.r, matrixBrightness.medium.g, matrixBrightness.medium.b),
  chalk.rgb(matrixBrightness.dim.r, matrixBrightness.dim.g, matrixBrightness.dim.b),
  chalk.rgb(matrixBrightness.darkest.r, matrixBrightness.darkest.g, matrixBrightness.darkest.b),
];

/** Default color function for fallback */
const defaultColor = brightnessColors[3];

/**
 * Render a strip to a colored string
 */
function renderStrip(strip: MatrixChar[]): string {
  return strip
    .map((item) => {
      const colorFn = brightnessColors[item.brightness] ?? defaultColor;
      if (!colorFn) {
        return item.char;
      }
      return colorFn(item.char);
    })
    .join("");
}

export function ActivityIndicator({
  message = "thinking...",
  width = 40,
  interval = 80,
  lines = 3,
  glyphSet = glyphSetE,
}: ActivityIndicatorProps): React.ReactNode {
  const tickRef = useRef(0);
  const [strips, setStrips] = useState<MatrixChar[][]>(() =>
    Array.from({ length: lines }, (_, i) => createStrip(width, glyphSet, 0, i))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      tickRef.current += 1;
      setStrips((prev) =>
        prev.map((strip, lineIndex) =>
          updateStrip(strip, tickRef.current, glyphSet, lineIndex)
        )
      );
    }, interval);

    return () => clearInterval(timer);
  }, [interval, glyphSet, width, lines]);

  return (
    <Box flexDirection="column">
      {strips.map((strip, i) => (
        <Box key={i}>
          <Text>{renderStrip(strip)}</Text>
          {i === lines - 1 && <Text color={colors.dimmed}>  {message}</Text>}
        </Box>
      ))}
    </Box>
  );
}
