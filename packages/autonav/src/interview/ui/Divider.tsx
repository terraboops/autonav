/**
 * Visual divider between conversation turns
 *
 * Uses the lightest glitch block for a subtle separator.
 */

import { Box, Text } from "ink";
import { colors, glitchBlocks } from "./theme.js";

/** Width of the divider line */
const DIVIDER_WIDTH = 60;

export function Divider(): React.ReactNode {
  const dividerLine = glitchBlocks[0].repeat(DIVIDER_WIDTH);

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={colors.dimmed}>{dividerLine}</Text>
    </Box>
  );
}
