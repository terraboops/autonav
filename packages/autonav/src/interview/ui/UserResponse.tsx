/**
 * User response display with rounded borders
 */

import { Box, Text } from "ink";
import { colors, boxChars } from "./theme.js";

interface UserResponseProps {
  /** User's response text */
  content: string;
}

export function UserResponse({ content }: UserResponseProps) {
  const { rounded } = boxChars;

  // Calculate width based on content
  const contentLength = content.length + 2; // +2 for "▸ " prefix
  const contentWidth = Math.max(Math.min(contentLength, 80), 40); // Min 40, max 80

  // Border width = content + 2 spaces + 2 borders
  const innerWidth = contentWidth + 2;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>
        {rounded.topLeft + rounded.horizontal.repeat(innerWidth) + rounded.topRight}
      </Text>
      <Text color={colors.dimmed}>
        {rounded.vertical + " "}
        <Text color={colors.primary}>▸ </Text>
        <Text color="white">{content.padEnd(contentWidth - 2)}</Text>
        <Text color={colors.dimmed}> {rounded.vertical}</Text>
      </Text>
      <Text color={colors.dimmed}>
        {rounded.bottomLeft + rounded.horizontal.repeat(innerWidth) + rounded.bottomRight}
      </Text>
    </Box>
  );
}
