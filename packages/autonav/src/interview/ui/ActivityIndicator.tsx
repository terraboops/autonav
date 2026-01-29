/**
 * Matrix-style animated activity indicator
 *
 * Displays a horizontal strip with Matrix digital rain aesthetics:
 * - Halfwidth katakana characters (authentic to The Matrix)
 * - Brightness wave effect (bright green → dark green)
 * - Randomly cycling glyphs
 */

import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import { matrixBrightness, colors, glyphSetE } from "./theme.js";

interface ActivityIndicatorProps {
  /** Message to display next to the indicator */
  message?: string;
  /** Width of the indicator in characters (default: 40) */
  width?: number;
  /** Update interval in milliseconds (default: 80) */
  interval?: number;
  /** Number of lines to display (default: 1) */
  lines?: number;
  /** Custom glyph set to use (default: matrixGlyphs) */
  glyphSet?: readonly string[];
}

/** Character with brightness level */
interface MatrixChar {
  char: string;
  brightness: number; // 0-3 (bright to darkest)
}

/**
 * Get a random glyph from the provided set
 */
function randomGlyph(glyphSet: readonly string[]): string {
  const glyph = glyphSet[Math.floor(Math.random() * glyphSet.length)];
  if (!glyph) {
    throw new Error("Failed to get random glyph");
  }
  return glyph;
}

/**
 * Initialize strip with random characters and brightness wave
 */
function initializeStrip(width: number, glyphSet: readonly string[], lineOffset: number = 0): MatrixChar[] {
  return Array.from({ length: width }, (_, i) => ({
    char: randomGlyph(glyphSet),
    // Create initial brightness wave with line offset for variation
    brightness: Math.floor((Math.sin((i + lineOffset * 10) / 3) + 1) * 1.5) % 4,
  }));
}

/**
 * Update the strip: shift brightness wave and randomly change some characters
 */
function updateStrip(strip: MatrixChar[], tick: number, glyphSet: readonly string[], lineOffset: number = 0): MatrixChar[] {
  return strip.map((item, i) => {
    // Brightness wave moves across the strip with line offset for variation
    const wavePosition = (i + tick + lineOffset * 10) / 4;
    const brightness = Math.floor((Math.sin(wavePosition) + 1) * 1.5) % 4;

    // Randomly change character ~20% of the time
    const char = Math.random() < 0.2 ? randomGlyph(glyphSet) : item.char;

    return { char, brightness };
  });
}

/**
 * Get chalk color function for brightness level
 */
function getColorForBrightness(brightness: number): chalk.Chalk {
  const { bright, medium, dim, darkest } = matrixBrightness;

  switch (brightness) {
    case 0:
      return chalk.rgb(bright.r, bright.g, bright.b);
    case 1:
      return chalk.rgb(medium.r, medium.g, medium.b);
    case 2:
      return chalk.rgb(dim.r, dim.g, dim.b);
    case 3:
    default:
      return chalk.rgb(darkest.r, darkest.g, darkest.b);
  }
}

export function ActivityIndicator({
  message = "thinking...",
  width = 40,
  interval = 80,
  lines = 3,
  glyphSet = glyphSetE,
}: ActivityIndicatorProps) {
  // Initialize multiple strips, one per line
  const [strips, setStrips] = useState<MatrixChar[][]>(() =>
    Array.from({ length: lines }, (_, i) => initializeStrip(width, glyphSet, i))
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      setStrips((prev) => prev.map((strip, lineIndex) => updateStrip(strip, tick, glyphSet, lineIndex)));
    }, interval);

    return () => clearInterval(timer);
  }, [interval, tick, lines, glyphSet]);

  // Build content for each line
  const lineContents = strips.map((strip) =>
    strip.map((item) => {
      const colorFn = getColorForBrightness(item.brightness);
      return colorFn(item.char);
    }).join("")
  );

  return (
    <Box flexDirection="column">
      {lineContents.map((content, i) => (
        <Box key={i}>
          <Text>{content}</Text>
          {i === lines - 1 && <Text color={colors.dimmed}>  {message}</Text>}
        </Box>
      ))}
    </Box>
  );
}
