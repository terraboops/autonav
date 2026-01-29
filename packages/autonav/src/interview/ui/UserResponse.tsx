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
  const maxWidth = 60;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors.dimmed}>
        {rounded.topLeft + rounded.horizontal.repeat(maxWidth) + rounded.topRight}
      </Text>
      <Text color={colors.dimmed}>
        {rounded.vertical + " "}
        <Text color={colors.primary}>▸ </Text>
        <Text color="white">{content}</Text>
      </Text>
      <Text color={colors.dimmed}>
        {rounded.bottomLeft + rounded.horizontal.repeat(maxWidth) + rounded.bottomRight}
      </Text>
    </Box>
  );
}
