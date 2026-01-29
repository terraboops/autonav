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

  // Calculate content width (aim for ~70 chars, but flexible)
  const maxWidth = 70;
  const lines = content.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>
        {single.topLeft + single.horizontal.repeat(maxWidth) + glitch.repeat(3) + single.topRight}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} color={colors.dimmed}>
          {single.vertical + " "}
          <Text color="white">{line}</Text>
        </Text>
      ))}
      <Text color={colors.dimmed}>
        {single.bottomLeft + glitch.repeat(3) + single.horizontal.repeat(maxWidth) + single.bottomRight}
      </Text>
    </Box>
  );
}
