/**
 * System/assistant message display with glitch-corner borders
 *
 * Uses single-line box characters with decorative glitch blocks at corners.
 * The glitch effect is achieved by replacing part of the horizontal border.
 */

import { Box, Text } from "ink";
import { colors, boxChars, glitchBlocks } from "./theme.js";
import { wrapText } from "./text-utils.js";

interface SystemMessageProps {
  /** Message content to display */
  content: string;
}

/** Maximum content width (will wrap text to fit) */
const MAX_WIDTH = 76;

/** Number of glitch characters to show at corners */
const GLITCH_COUNT = 3;

export function SystemMessage({ content }: SystemMessageProps): React.ReactNode {
  const { single } = boxChars;
  const glitch = glitchBlocks[3]; // Solid block for corners

  // Wrap text to fit within max width
  const lines = wrapText(content, MAX_WIDTH);
  const contentWidth = MAX_WIDTH;

  // Total inner width includes 1 space padding on each side
  const innerWidth = contentWidth + 2;

  // Build borders - glitch replaces part of the horizontal line, not added to it
  // Top: corner + (horizontal - glitch) + glitch + corner
  // Bottom: corner + glitch + (horizontal - glitch) + corner
  const horizontalLength = innerWidth - GLITCH_COUNT;
  const topBorder =
    single.topLeft +
    single.horizontal.repeat(horizontalLength) +
    glitch.repeat(GLITCH_COUNT) +
    single.topRight;
  const bottomBorder =
    single.bottomLeft +
    glitch.repeat(GLITCH_COUNT) +
    single.horizontal.repeat(horizontalLength) +
    single.bottomRight;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>{topBorder}</Text>
      {lines.map((line, i) => (
        <Text key={i} color={colors.dimmed}>
          {single.vertical + " "}
          <Text color="white">{line.padEnd(contentWidth)}</Text>
          {" " + single.vertical}
        </Text>
      ))}
      <Text color={colors.dimmed}>{bottomBorder}</Text>
    </Box>
  );
}
