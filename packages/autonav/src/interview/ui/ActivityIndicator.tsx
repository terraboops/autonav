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
import { matrixGlyphs, matrixBrightness, boxChars, colors } from "./theme.js";

interface ActivityIndicatorProps {
  /** Message to display next to the indicator */
  message?: string;
  /** Width of the indicator in characters (default: 40) */
  width?: number;
  /** Update interval in milliseconds (default: 80) */
  interval?: number;
}

/** Character with brightness level */
interface MatrixChar {
  char: string;
  brightness: number; // 0-3 (bright to darkest)
}

/**
 * Get a random glyph from the matrix set
 */
function randomGlyph(): string {
  const glyph = matrixGlyphs[Math.floor(Math.random() * matrixGlyphs.length)];
  if (!glyph) {
    throw new Error("Failed to get random glyph");
  }
  return glyph;
}

/**
 * Initialize strip with random characters and brightness wave
 */
function initializeStrip(width: number): MatrixChar[] {
  return Array.from({ length: width }, (_, i) => ({
    char: randomGlyph(),
    // Create initial brightness wave
    brightness: Math.floor((Math.sin(i / 3) + 1) * 1.5) % 4,
  }));
}

/**
 * Update the strip: shift brightness wave and randomly change some characters
 */
function updateStrip(strip: MatrixChar[], tick: number): MatrixChar[] {
  return strip.map((item, i) => {
    // Brightness wave moves across the strip
    const wavePosition = (i + tick) / 4;
    const brightness = Math.floor((Math.sin(wavePosition) + 1) * 1.5) % 4;

    // Randomly change character ~20% of the time
    const char = Math.random() < 0.2 ? randomGlyph() : item.char;

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
}: ActivityIndicatorProps) {
  const [strip, setStrip] = useState<MatrixChar[]>(() => initializeStrip(width));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      setStrip((prev) => updateStrip(prev, tick));
    }, interval);

    return () => clearInterval(timer);
  }, [interval, tick]);

  const { single } = boxChars;

  // Render each character with its brightness color
  const renderedChars = strip.map((item, i) => {
    const colorFn = getColorForBrightness(item.brightness);
    return <Text key={i}>{colorFn(item.char)}</Text>;
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={colors.dimmed}>{single.topLeft}</Text>
        <Text color={colors.dimmed}>{single.horizontal.repeat(width + 2)}</Text>
        <Text color={colors.dimmed}>{single.topRight}</Text>
      </Box>
      <Box>
        <Text color={colors.dimmed}>{single.vertical} </Text>
        {renderedChars}
        <Text color={colors.dimmed}> {single.vertical}</Text>
      </Box>
      <Box>
        <Text color={colors.dimmed}>{single.bottomLeft}</Text>
        <Text color={colors.dimmed}>{single.horizontal.repeat(width + 2)}</Text>
        <Text color={colors.dimmed}>{single.bottomRight}</Text>
        <Text color={colors.dimmed}>  {message}</Text>
      </Box>
    </Box>
  );
}
