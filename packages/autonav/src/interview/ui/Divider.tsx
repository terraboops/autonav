/**
 * Visual divider between conversation turns
 */

import { Box, Text } from "ink";
import { colors, glitchBlocks } from "./theme.js";

export function Divider() {
  const width = 60;
  const glitchLine = glitchBlocks[0].repeat(width); // Use lightest block

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={colors.dimmed}>{glitchLine}</Text>
    </Box>
  );
}
