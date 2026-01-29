/**
 * System/assistant message display with glitch-corner borders
 */

import { Box, Text } from "ink";
import { colors, boxChars, glitchBlocks } from "./theme.js";

interface SystemMessageProps {
  /** Message content to display */
  content: string;
}

export function SystemMessage({ content }: SystemMessageProps) {
  const { single } = boxChars;
  const glitch = glitchBlocks[3]; // Use solid block for corners
  const glitchCount = 3;

  // Split content and find the longest line
  const lines = content.split("\n");
  const longestLine = Math.max(...lines.map(l => l.length), 60); // Min 60 chars
  const contentWidth = Math.min(longestLine, 80); // Max 80 chars

  // Border width = content + 2 spaces + 2 borders
  const innerWidth = contentWidth + 2;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>
        {single.topLeft + single.horizontal.repeat(innerWidth) + glitch.repeat(glitchCount) + single.topRight}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} color={colors.dimmed}>
          {single.vertical + " "}
          <Text color="white">{line.padEnd(contentWidth)}</Text>
          <Text color={colors.dimmed}> {single.vertical}</Text>
        </Text>
      ))}
      <Text color={colors.dimmed}>
        {single.bottomLeft + glitch.repeat(glitchCount) + single.horizontal.repeat(innerWidth) + single.bottomRight}
      </Text>
    </Box>
  );
}
